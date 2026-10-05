import { describe, expect, it } from "vitest";

import {
  canOpenTriage,
  queueActionLabels,
  queueActionsForRole,
  queueActionsForStatus,
  queueActionsNeedConfirm,
} from "@/features/queue/actions";

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
    expect(queueActionLabels.start).toBe("Start consultation");
    expect(queueActionLabels.requeue).toBe("Requeue");
  });

  it("requires confirmation before skip", () => {
    expect(queueActionsNeedConfirm).toEqual(["skip"]);
  });

  it("hides doctor queue actions without appointments.update", () => {
    expect(queueActionsForRole("called", ["appointments.view"])).toEqual([]);
    expect(queueActionsForRole("called", ["appointments.update"])).toEqual(["start", "skip"]);
  });

  it("allows triage link while waiting with triage or vitals permission", () => {
    expect(canOpenTriage({ status: "waiting" }, ["triage.start"])).toBe(true);
    expect(canOpenTriage({ status: "waiting" }, ["vitals.record"])).toBe(true);
    expect(canOpenTriage({ status: "waiting" }, ["appointments.update"])).toBe(false);
    expect(canOpenTriage({ status: "called" }, ["triage.start"])).toBe(false);
  });
});
