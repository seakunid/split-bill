import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";
import { resolveClientIp } from "./rate-limit.js";
import type { BillVision } from "./vision.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("resolveClientIp", () => {
  it("ignores forwarded headers unless the proxy is trusted", () => {
    const source = {
      remoteAddress: "10.0.0.8",
      forwardedFor: "1.2.3.4, 10.0.0.8",
      realIp: "1.2.3.4",
    };
    expect(resolveClientIp(source, false)).toBe("10.0.0.8");
    expect(resolveClientIp(source, true)).toBe("1.2.3.4");
  });

  it("uses X-Real-IP only as a trusted fallback", () => {
    const source = { remoteAddress: "10.0.0.8", forwardedFor: "  ", realIp: " 8.8.8.8 " };
    expect(resolveClientIp(source, true)).toBe("8.8.8.8");
    expect(resolveClientIp({ remoteAddress: null, forwardedFor: null, realIp: null }, false)).toBe("unknown");
  });
});

describe("POST /bills/parse rate limit", () => {
  it("returns 429 with Retry-After and does not call the model again", async () => {
    let now = 1_700_000_000_000;
    let calls = 0;
    const vision: BillVision = {
      async parse() {
        calls += 1;
        return { currency: "IDR", items: [], tax: 0, serviceCharge: 0, discount: 0, rounding: 0, total: 0 };
      },
    };
    const app = createApp({
      prisma: {} as PrismaClient,
      vision,
      corsOrigin: "http://localhost:3000",
      parseRateLimit: { max: 1, windowMs: 60_000, trustProxy: false, now: () => now },
      getRemoteAddress: () => "203.0.113.4",
    });

    const first = await app.request("/bills/parse", { method: "POST", body: imageForm(), headers: spoofedHeaders() });
    expect(first.status).toBe(200);
    expect(calls).toBe(1);

    const limited = await app.request("/bills/parse", {
      method: "POST",
      body: imageForm(),
      headers: { ...spoofedHeaders(), Origin: "http://localhost:3000" },
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limited.headers.get("access-control-expose-headers")).toMatch(/retry-after/i);
    expect(await limited.json()).toEqual({ error: "Too many parse requests" });
    expect(calls).toBe(1);

    now += 60_000;
    const again = await app.request("/bills/parse", { method: "POST", body: imageForm() });
    expect(again.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not let a spoofed forwarding header pick a new bucket", async () => {
    const app = createApp({
      prisma: {} as PrismaClient,
      vision: { async parse() { return {}; } },
      corsOrigin: "http://localhost:3000",
      parseRateLimit: { max: 1, windowMs: 60_000, trustProxy: false },
      getRemoteAddress: () => null,
    });

    const first = await app.request("/bills/parse", {
      method: "POST",
      headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "1.1.1.1" },
    });
    const second = await app.request("/bills/parse", {
      method: "POST",
      headers: { "x-forwarded-for": "2.2.2.2", "x-real-ip": "2.2.2.2" },
    });
    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
  });

  it("uses the forwarded client only when the proxy is trusted", async () => {
    const app = createApp({
      prisma: {} as PrismaClient,
      vision: null,
      corsOrigin: "http://localhost:3000",
      parseRateLimit: { max: 1, windowMs: 60_000, trustProxy: true },
      getRemoteAddress: () => "10.0.0.8",
    });

    const fromA = await app.request("/bills/parse", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.8" },
    });
    const fromB = await app.request("/bills/parse", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.11" },
    });
    const fromAAgain = await app.request("/bills/parse", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    expect(fromA.status).toBe(503);
    expect(fromB.status).toBe(503);
    expect(fromAAgain.status).toBe(429);
  });

  it("does not limit other routes", async () => {
    const app = createApp({
      prisma: {} as PrismaClient,
      vision: null,
      corsOrigin: "http://localhost:3000",
      parseRateLimit: { max: 1, windowMs: 60_000, trustProxy: false },
    });
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/health")).status).toBe(200);
  });
});

describe("loadEnv rate limit", () => {
  it("defaults the parse limit and keeps proxy trust off", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://localhost/splitbill" });
    expect(env.parseRateLimitMax).toBe(10);
    expect(env.parseRateLimitWindowSeconds).toBe(60);
    expect(env.trustProxy).toBe(false);
    expect(loadEnv({ DATABASE_URL: "postgresql://localhost/splitbill", TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(() => loadEnv({ DATABASE_URL: "postgresql://localhost/splitbill", TRUST_PROXY: "maybe" })).toThrow(/TRUST_PROXY/);
    expect(() => loadEnv({ DATABASE_URL: "postgresql://localhost/splitbill", PARSE_RATE_LIMIT_MAX: "0" })).toThrow(
      /PARSE_RATE_LIMIT_MAX/,
    );
  });
});

function imageForm(): FormData {
  const form = new FormData();
  form.set("image", new File([png], "bill.jpg", { type: "image/jpeg" }));
  return form;
}

function spoofedHeaders(): Record<string, string> {
  return { "x-forwarded-for": "198.51.100.20", "x-real-ip": "198.51.100.20" };
}
