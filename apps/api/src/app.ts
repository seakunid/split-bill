import { getConnInfo } from "@hono/node-server/conninfo";
import { cors } from "hono/cors";
import { Hono, type Context } from "hono";
import type { PrismaClient } from "@prisma/client";
import type { ApiError } from "@split-bill/shared";
import { HttpError } from "./http.js";
import { createFixedWindowRateLimiter } from "./rate-limit.js";
import { billRoutes } from "./routes/bills.js";
import type { BillVision } from "./vision.js";

export type ParseRateLimitOptions = {
  max: number;
  windowMs: number;
  trustProxy: boolean;
  now?: () => number;
};

const defaultParseRateLimit: ParseRateLimitOptions = {
  max: 10,
  windowMs: 60_000,
  trustProxy: false,
};

export type AppDeps = {
  prisma: PrismaClient;
  vision: BillVision | null;
  corsOrigin: string;
  parseRateLimit?: ParseRateLimitOptions;
  /** Override socket IP lookup. Production uses the Node connection address. */
  getRemoteAddress?: (c: Context) => string | null;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const origins = deps.corsOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.use(
    "*",
    cors({
      origin: origins.length === 1 ? (origins[0] ?? deps.corsOrigin) : origins,
      allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      exposeHeaders: ["Retry-After"],
    }),
  );

  const rateLimit = deps.parseRateLimit ?? defaultParseRateLimit;
  app.get("/health", (c) => c.json({ ok: true }));
  app.route(
    "/",
    billRoutes({
      prisma: deps.prisma,
      vision: deps.vision,
      trustProxy: rateLimit.trustProxy,
      rateLimiter: createFixedWindowRateLimiter(rateLimit),
      getRemoteAddress: deps.getRemoteAddress ?? remoteAddressFromSocket,
    }),
  );

  app.notFound((c) => c.json({ error: "Not found" } satisfies ApiError, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      const body: ApiError = err.issues ? { error: err.message, issues: err.issues } : { error: err.message };
      return c.json(body, err.status as 400);
    }
    console.error(err);
    return c.json({ error: "Internal server error" } satisfies ApiError, 500);
  });

  return app;
}

function remoteAddressFromSocket(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}
