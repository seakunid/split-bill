import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDotenv } from "./src/env.js";

export default function setup(): void {
  loadDotenv();
  process.env.DATABASE_URL ??= "postgresql://splitbill:splitbill@localhost:5432/splitbill";
  execSync("pnpm exec prisma migrate deploy", {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    stdio: "inherit",
    env: process.env,
  });
}
