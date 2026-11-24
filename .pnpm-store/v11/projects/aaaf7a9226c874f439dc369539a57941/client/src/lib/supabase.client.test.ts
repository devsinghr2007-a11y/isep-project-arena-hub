import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("ArenaHub browser API client", () => {
  it("uses same-origin API requests and does not embed database credentials", () => {
    const moduleSource = readFileSync(fileURLToPath(new URL("./api.ts", import.meta.url)), "utf8");
    expect(moduleSource).toMatch(/credentials: "same-origin"/);
    expect(moduleSource).not.toMatch(/MONGODB_URI|JWT_SECRET|SERVICE_ROLE|DATABASE_URL/);
  });

  it("contains no restricted database or payment secret references anywhere in browser source", () => {
    const clientRoot = fileURLToPath(new URL("../..", import.meta.url));
    const browserFiles: string[] = [];

    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(entryPath);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) browserFiles.push(entryPath);
      }
    };

    visit(clientRoot);
    const browserSource = browserFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(browserSource).not.toMatch(/SUPABASE_SERVICE_ROLE|CRYPTOMUS|MERCHANT|WEBHOOK_SECRET|DATABASE_URL|JWT_SECRET/);
    expect(browserSource).not.toMatch(/MONGODB_URI/);
  });
});
