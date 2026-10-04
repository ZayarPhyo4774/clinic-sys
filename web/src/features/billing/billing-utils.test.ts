import { describe, expect, it } from "vitest";

import { formatMoney, invoiceLineTotal } from "@/features/billing/billing-utils";

describe("billing-utils", () => {
  it("formats currency amounts", () => {
    expect(formatMoney("USD", "45", "en-US")).toMatch(/\$45\.00/);
    expect(formatMoney("MMK", "4500", "en-US")).toMatch(/MMK|Ks/);
  });

  it("calculates invoice line totals", () => {
    expect(
      invoiceLineTotal({
        quantity: "2",
        unit_price: "10.00",
        discount_amount: "1.00",
      }),
    ).toBe(19);
  });
});
