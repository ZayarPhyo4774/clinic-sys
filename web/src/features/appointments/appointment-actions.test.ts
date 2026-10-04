import { describe, expect, it } from "vitest";

import { appointmentActionsForStatus } from "@/features/appointments/appointment-actions";

describe("appointment actions", () => {
  it("offers confirm, reschedule, no-show, and cancel for a scheduled visit", () => {
    expect(appointmentActionsForStatus("scheduled")).toEqual([
      "confirm",
      "reschedule",
      "no-show",
      "cancel",
    ]);
  });

  it("offers check-in, reschedule, no-show, and cancel after confirmation", () => {
    expect(appointmentActionsForStatus("confirmed")).toEqual([
      "check-in",
      "reschedule",
      "no-show",
      "cancel",
    ]);
  });

  it("offers queue after check-in", () => {
    expect(appointmentActionsForStatus("checked_in")).toEqual(["queue", "cancel"]);
  });

  it("offers no appointment actions once the visit is in consultation", () => {
    expect(appointmentActionsForStatus("in_consultation")).toEqual([]);
  });
});
