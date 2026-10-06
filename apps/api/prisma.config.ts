import { defineConfig } from "prisma/config";
import { loadDotenv } from "./src/load-env.ts";

// Prisma only auto-loads `.env` beside the schema. Load the shared files
// before the schema reads env("DATABASE_URL").
loadDotenv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
