import { describe, expect, it } from "vitest";

import { queueActionLabels, queueActionsForStatus, queueActionsNeedConfirm } from "@/features/queue/actions";

describe("queue actions", () => {
  it("offers call and skip while waiting", () => {
    expect(queueActionsForStatus("waiting")).toEqual(["call", "skip"]);
  });

  it("offers start and skip when called", () => {
    expect(queueActionsForStatus("called")).toEqual(["start", "skip"]);
  });

  it("offers complete while in service", () => {
    expect(queueActionsForStatus("in_service")).toEqual(["complete"]);
  });

  it("offers requeue after skip", () => {
    expect(queueActionsForStatus("skipped")).toEqual(["requeue"]);
  });

  it("uses readable action labels", () => {
    expect(queueActionLabels.call).toBe("Call patient");
    expect(queueActionLabels.requeue).toBe("Requeue");
  });

  it("requires confirmation before skip", () => {
    expect(queueActionsNeedConfirm).toEqual(["skip"]);
  });
});
