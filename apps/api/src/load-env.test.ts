import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { envFilePaths, loadEnvFiles } from "./load-env.js";

const KEYS = ["SPLIT_BILL_ENV_TEST_A", "SPLIT_BILL_ENV_TEST_B", "SPLIT_BILL_ENV_TEST_C"] as const;

function clearTestEnv(): void {
  for (const key of KEYS) delete process.env[key];
}

describe("loadEnvFiles", () => {
  afterEach(clearTestEnv);

  it("keeps process env, lets apps/api/.env win, and fills gaps from the root .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "split-bill-env-"));
    const higher = join(dir, "api.env");
    const lower = join(dir, "root.env");
    writeFileSync(higher, "SPLIT_BILL_ENV_TEST_A=from-api\nSPLIT_BILL_ENV_TEST_B=from-api\n");
    writeFileSync(lower, "SPLIT_BILL_ENV_TEST_A=from-root\nSPLIT_BILL_ENV_TEST_C=from-root\n");
    process.env.SPLIT_BILL_ENV_TEST_B = "from-process";

    try {
      loadEnvFiles({ higher, lower });
      expect(process.env.SPLIT_BILL_ENV_TEST_A).toBe("from-api");
      expect(process.env.SPLIT_BILL_ENV_TEST_B).toBe("from-process");
      expect(process.env.SPLIT_BILL_ENV_TEST_C).toBe("from-root");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("envFilePaths", () => {
  it("resolves apps/api/.env and the repo-root .env from src and dist", () => {
    const fromSrc = envFilePaths(pathToFileURL("/repo/apps/api/src/load-env.ts").href);
    const fromDist = envFilePaths(pathToFileURL("/repo/apps/api/dist/load-env.js").href);
    expect(fromSrc).toEqual({
      apiEnv: "/repo/apps/api/.env",
      rootEnv: "/repo/.env",
    });
    expect(fromDist).toEqual(fromSrc);
  });

  it("points at this checkout", () => {
    const paths = envFilePaths();
    expect(paths.apiEnv).toBe(resolve(import.meta.dirname, "../.env"));
    expect(paths.rootEnv).toBe(resolve(import.meta.dirname, "../../../.env"));
  });
});
