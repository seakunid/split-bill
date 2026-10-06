import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { loadDotenv, loadEnv } from "./env.js";
import { createOpenAIVision } from "./vision.js";

loadDotenv();
const env = loadEnv();
const prisma = new PrismaClient();
const vision = env.openaiApiKey
  ? createOpenAIVision({
      apiKey: env.openaiApiKey,
      model: env.openaiModel,
      baseUrl: env.openaiBaseUrl,
    })
  : null;

const app = createApp({
  prisma,
  vision,
  corsOrigin: env.corsOrigin,
  parseRateLimit: {
    max: env.parseRateLimitMax,
    windowMs: env.parseRateLimitWindowSeconds * 1000,
    trustProxy: env.trustProxy,
  },
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
