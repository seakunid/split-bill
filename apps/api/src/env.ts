export { loadDotenv } from "./load-env.js";

export type Env = {
  databaseUrl: string;
  port: number;
  corsOrigin: string;
  openaiApiKey: string | null;
  openaiModel: string;
  openaiBaseUrl: string;
  parseRateLimitMax: number;
  parseRateLimitWindowSeconds: number;
  trustProxy: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const port = Number(source.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }
  const apiKey = source.OPENAI_API_KEY?.trim() ?? "";
  return {
    databaseUrl,
    port,
    corsOrigin: source.CORS_ORIGIN?.trim() || "http://localhost:3000",
    openaiApiKey: apiKey.length > 0 ? apiKey : null,
    openaiModel: source.OPENAI_MODEL?.trim() || "gpt-4o",
    openaiBaseUrl: source.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    parseRateLimitMax: readPositiveInt(source, "PARSE_RATE_LIMIT_MAX", 10),
    parseRateLimitWindowSeconds: readPositiveInt(source, "PARSE_RATE_LIMIT_WINDOW_SECONDS", 60),
    trustProxy: readBoolean(source, "TRUST_PROXY", false),
  };
}

function readPositiveInt(source: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = source[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readBoolean(source: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = source[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  throw new Error(`${name} must be true or false`);
}
