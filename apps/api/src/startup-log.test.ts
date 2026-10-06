import { describe, expect, it } from "vitest";
import { formatStartupSummary } from "./startup-log.js";

describe("formatStartupSummary", () => {
  it("lists port, cors, key presence, model, and loaded env files", () => {
    const line = formatStartupSummary({
      port: 3001,
      corsOrigin: "http://localhost:3000,http://127.0.0.1:3000",
      visionKeySet: true,
      model: "gpt-4o",
      loadedEnvFiles: ["/repo/apps/api/.env", "/repo/.env"],
    });
    expect(line).toBe(
      "API config port=3001 cors=http://localhost:3000,http://127.0.0.1:3000 visionKey=yes model=gpt-4o envFiles=/repo/apps/api/.env > /repo/.env (first wins)",
    );
    expect(line).not.toContain("sk-");
  });

  it("says when no key and no env file is loaded", () => {
    const line = formatStartupSummary({
      port: 3001,
      corsOrigin: "http://localhost:3000",
      visionKeySet: false,
      model: "gpt-4o",
      loadedEnvFiles: [],
    });
    expect(line).toContain("visionKey=no");
    expect(line).toContain("envFiles=none");
  });
});
