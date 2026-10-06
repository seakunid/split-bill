import { billResponseSchema, billWriteSchema, idSchema, PARSE_IMAGE_FIELD_NAME, type ApiError } from "@split-bill/shared";
import { Hono } from "hono";
import type { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { createBill, getBill, updateBill } from "../bills.js";
import { HttpError } from "../http.js";
import { ImageUploadError, readBillImage } from "../image.js";
import { DraftNormalizationError, normalizeParsedBill } from "../normalize.js";
import type { BillVision } from "../vision.js";
import { VisionProviderError } from "../vision.js";

export function billRoutes(deps: { prisma: PrismaClient; vision: BillVision | null }) {
  const routes = new Hono();

  routes.post("/bills/parse", async (c) => {
    if (!deps.vision) {
      return c.json({ error: "Bill parsing is not configured" } satisfies ApiError, 503);
    }
    let image: { mimeType: string; bytes: Uint8Array };
    try {
      const body = await c.req.parseBody();
      image = await readBillImage(body[PARSE_IMAGE_FIELD_NAME]);
    } catch (error) {
      if (error instanceof ImageUploadError) {
        return c.json({ error: error.message } satisfies ApiError, error.status);
      }
      throw error;
    }

    try {
      const raw = await deps.vision.parse(image);
      return c.json(normalizeParsedBill(raw));
    } catch (error) {
      if (error instanceof DraftNormalizationError) {
        return c.json({ error: error.message } satisfies ApiError, 422);
      }
      if (error instanceof VisionProviderError) {
        return c.json({ error: "Could not parse the bill image" } satisfies ApiError, 502);
      }
      throw error;
    }
  });

  routes.post("/bills", async (c) => {
    const input = await readBillWrite(c);
    const bill = billResponseSchema.parse(await createBill(deps.prisma, input));
    return c.json(bill, 201);
  });

  routes.get("/bills/:id", async (c) => {
    const id = readBillId(c.req.param("id"));
    const bill = billResponseSchema.parse(await getBill(deps.prisma, id));
    return c.json(bill);
  });

  routes.put("/bills/:id", async (c) => {
    const id = readBillId(c.req.param("id"));
    const input = await readBillWrite(c);
    const bill = billResponseSchema.parse(await updateBill(deps.prisma, id, input));
    return c.json(bill);
  });

  return routes;
}

async function readBillWrite(c: { req: { json: () => Promise<unknown> } }) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError("Invalid JSON", 400);
  }
  try {
    return billWriteSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError("Invalid request", 400, error.issues.map(zodIssue));
    }
    throw error;
  }
}

function readBillId(id: string): string {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) throw new HttpError("Invalid bill id", 400);
  return parsed.data;
}

function zodIssue(issue: ZodError["issues"][number]) {
  return {
    code: issue.code,
    message: issue.message,
    path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"),
  };
}
