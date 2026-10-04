import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { navigation } from "@/features/access/navigation";

const appDir = path.dirname(fileURLToPath(import.meta.url));

function pageFor(href: string) {
  if (href === "/") {
    return path.join(appDir, "(clinic)", "page.tsx");
  }
  return path.join(appDir, "(clinic)", href.slice(1), "page.tsx");
}

describe("pages", () => {
  it("has a page for every navigation entry and for login", () => {
    for (const item of navigation) {
      expect(fs.existsSync(pageFor(item.href)), item.href).toBe(true);
    }
    expect(fs.existsSync(path.join(appDir, "login", "page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "(operator)", "operator", "page.tsx"))).toBe(true);
  });

  it("keeps billing behind its permission and the invoice API", () => {
    const source = fs.readFileSync(pageFor("/billing"), "utf8");
    expect(source).toContain("BillingScreen");
    const screen = fs.readFileSync(
      path.resolve(appDir, "../features/billing/billing-screen.tsx"),
      "utf8",
    );
    expect(screen).toContain('permission="billing.view"');
    expect(screen).toContain('path="/invoices/"');
  });
});
