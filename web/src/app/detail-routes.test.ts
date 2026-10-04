import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const detailRoutes = [
  "/patients/[id]",
  "/appointments/[id]",
  "/consultation/[id]",
  "/prescriptions/[id]",
  "/pharmacy/[id]",
  "/laboratory/[id]",
  "/laboratory/tests/[id]",
  "/billing/[id]",
  "/staff/[id]",
];

describe("detail routes", () => {
  it("has a page for each detail route", () => {
    for (const route of detailRoutes) {
      const pagePath = path.join(appDir, "(clinic)", route, "page.tsx");
      expect(fs.existsSync(pagePath), route).toBe(true);
    }
  });
});
