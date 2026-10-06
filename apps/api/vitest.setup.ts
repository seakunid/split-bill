import { loadDotenv } from "./src/env.js";

loadDotenv();
process.env.DATABASE_URL ??= "postgresql://splitbill:splitbill@localhost:5432/splitbill";
