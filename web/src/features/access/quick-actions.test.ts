import { describe, expect, it } from "vitest";

import { quickActionsFor } from "@/features/access/quick-actions";

describe("quick actions", () => {
  it("shows booking for reception permissions", () => {
    const labels = quickActionsFor(["appointments.create", "appointments.view"]).map((action) => action.label);
    expect(labels).toContain("Book appointment");
    expect(labels).toContain("Queue board");
  });

  it("hides billing when billing.view is missing", () => {
    const labels = quickActionsFor(["patients.create"]).map((action) => action.label);
    expect(labels).not.toContain("Billing");
  });
});
