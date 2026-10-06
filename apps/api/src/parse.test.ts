import { PARSE_IMAGE_FIELD_NAME, apiErrorSchema, parsedBillDraftSchema } from "@split-bill/shared";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { readBillImage } from "./image.js";
import type { BillVision } from "./vision.js";
import { VisionProviderError } from "./vision.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function appWith(vision: BillVision | null, corsOrigin = "http://localhost:3000") {
  return createApp({ prisma: {} as PrismaClient, vision, corsOrigin });
}

describe("POST /bills/parse", () => {
  it("returns a draft validated by the shared schema", async () => {
    const vision: BillVision = {
      async parse() {
        return {
          currency: "idr",
          items: [{ name: "Nasi goreng", quantity: 1, unitPrice: 20_000, lineTotal: 20_000 }],
          subtotal: 0,
          tax: 2_000,
          serviceCharge: 1_000,
          discount: 0,
          total: 0,
        };
      },
    };
    const form = new FormData();
    form.set(PARSE_IMAGE_FIELD_NAME, new File([png], "bill.jpg", { type: "image/jpeg" }));
    const response = await appWith(vision).request("/bills/parse", { method: "POST", body: form });
    expect(response.status).toBe(200);
    const body = parsedBillDraftSchema.parse(await response.json());
    expect(body).toMatchObject({ currency: "IDR", subtotal: 20_000, tax: 2_000, total: 23_000 });
  });

  it("accepts a PNG filename when the browser omits the mime type", async () => {
    const form = new FormData();
    form.set(PARSE_IMAGE_FIELD_NAME, new File([png], "bill.png", { type: "" }));
    const response = await appWith({
      async parse(image) {
        expect(image.mimeType).toBe("image/png");
        return { currency: "IDR", items: [], tax: 0, serviceCharge: 0, discount: 0 };
      },
    }).request("/bills/parse", { method: "POST", body: form });
    expect(response.status).toBe(200);
  });

  it("returns 400 when the image field is missing", async () => {
    const response = await appWith({ async parse() { return {}; } }).request("/bills/parse", {
      method: "POST",
      body: new FormData(),
    });
    expect(response.status).toBe(400);
  });

  it("returns 415 for a non-image upload", async () => {
    const form = new FormData();
    form.set(PARSE_IMAGE_FIELD_NAME, new File(["hello"], "notes.txt", { type: "text/plain" }));
    const response = await appWith({ async parse() { return {}; } }).request("/bills/parse", {
      method: "POST",
      body: form,
    });
    expect(response.status).toBe(415);
  });

  it("returns 422 when the model payload cannot be normalized", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await appWith({
        async parse() {
          return { currency: "ID", items: [] };
        },
      }).request("/bills/parse", {
        method: "POST",
        body: formWithImage(),
      });
      expect(response.status).toBe(422);
      expect(apiErrorSchema.parse(await response.json())).toEqual({
        error: "Parsed bill did not match the expected shape",
        code: "vision_unreadable",
      });
      expect(warn).toHaveBeenCalled();
      const line = warn.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
      expect(line).toContain("parse draft rejected");
      expect(line).toContain("currency");
    } finally {
      warn.mockRestore();
    }
  });

  it("returns 502 when the vision provider fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await appWith({
        async parse() {
          throw new VisionProviderError({
            code: "vision_unavailable",
            providerStatus: 429,
            providerType: "insufficient_quota",
            providerCode: "insufficient_quota",
            detail: "You exceeded your current quota",
          });
        },
      }).request("/bills/parse", { method: "POST", body: formWithImage() });
      expect(response.status).toBe(502);
      expect(apiErrorSchema.parse(await response.json())).toEqual({
        error: "Could not parse the bill image",
        code: "vision_unavailable",
      });
      const line = errorLog.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
      expect(line).toContain("status=429");
      expect(line).toContain("insufficient_quota");
      expect(line).toContain("You exceeded your current quota");
    } finally {
      errorLog.mockRestore();
    }
  });

  it("returns 502 for an unreadable provider result without the provider text", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await appWith({
        async parse() {
          throw new VisionProviderError({
            code: "vision_unreadable",
            providerStatus: 200,
            providerType: null,
            providerCode: null,
            detail: "invalid JSON from the model",
          });
        },
      }).request("/bills/parse", { method: "POST", body: formWithImage() });
      expect(response.status).toBe(502);
      const body = apiErrorSchema.parse(await response.json());
      expect(body).toEqual({
        error: "Could not parse the bill image",
        code: "vision_unreadable",
      });
      expect(JSON.stringify(body)).not.toContain("invalid JSON from the model");
    } finally {
      errorLog.mockRestore();
    }
  });

  it("returns 503 when no API key is configured", async () => {
    const response = await appWith(null).request("/bills/parse", { method: "POST", body: formWithImage() });
    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json())).toEqual({
      error: "Bill parsing is not configured",
      code: "vision_unavailable",
    });
  });
});

describe("readBillImage", () => {
  it("rejects files over the configured limit", async () => {
    const file = new File([Uint8Array.from([1, 2, 3, 4, 5])], "bill.jpg", { type: "image/jpeg" });
    await expect(readBillImage(file, 4)).rejects.toMatchObject({ status: 413 });
  });
});

describe("CORS", () => {
  it("allows the configured web origin and ignores others", async () => {
    const app = appWith(null, "http://localhost:3000,http://127.0.0.1:3000");
    const allowed = await app.request("/health", { headers: { Origin: "http://localhost:3000" } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");

    const blocked = await app.request("/health", { headers: { Origin: "https://evil.test" } });
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });
});

function formWithImage(): FormData {
  const form = new FormData();
  form.set(PARSE_IMAGE_FIELD_NAME, new File([png], "bill.jpg", { type: "image/jpeg" }));
  return form;
}
