import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Highest precedence first: variables already in the process environment,
 * then `apps/api/.env`, then the repo-root `.env`.
 * Paths come from this file so `tsx`, the compiled API, and Prisma all
 * find the same files whatever the working directory is.
 */
export function loadEnvFiles(files: { higher: string; lower: string }): void {
  dotenv.config({ path: files.higher, quiet: true, override: false });
  dotenv.config({ path: files.lower, quiet: true, override: false });
}

export function envFilePaths(fromModuleUrl: string = import.meta.url): {
  apiEnv: string;
  rootEnv: string;
} {
  const apiRoot = resolve(dirname(fileURLToPath(fromModuleUrl)), "..");
  return {
    apiEnv: resolve(apiRoot, ".env"),
    rootEnv: resolve(apiRoot, "../..", ".env"),
  };
}

export function loadDotenv(): void {
  const paths = envFilePaths();
  loadEnvFiles({ higher: paths.apiEnv, lower: paths.rootEnv });
}
