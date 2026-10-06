import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Highest precedence first: variables already in the process environment,
 * then `apps/api/.env`, then the repo-root `.env`.
 * Paths come from this file so `tsx`, the compiled API, and Prisma all
 * find the same files whatever the working directory is.
 */
/** Returns the files that existed, highest precedence first. */
export function loadEnvFiles(files: { higher: string; lower: string }): string[] {
  const loaded: string[] = [];
  for (const path of [files.higher, files.lower]) {
    const result = dotenv.config({ path, quiet: true, override: false });
    if (!result.error) loaded.push(path);
  }
  return loaded;
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

export function loadDotenv(): string[] {
  const paths = envFilePaths();
  return loadEnvFiles({ higher: paths.apiEnv, lower: paths.rootEnv });
}
