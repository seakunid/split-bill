import dotenv from "dotenv";
import { resolve } from "node:path";

export type Env = {
  databaseUrl: string;
  port: number;
  corsOrigin: string;
  openaiApiKey: string | null;
  openaiModel: string;
  openaiBaseUrl: string;
};

/** `apps/api/.env` wins. The repo-root `.env` fills anything still unset. */
export function loadDotenv(): void {
  dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });
  dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
}

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
  };
}
