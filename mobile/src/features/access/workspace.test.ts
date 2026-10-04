import { describe, expect, it } from "vitest";

import {
  allowed,
  destinationsFor,
  workspaceFromPermissions,
  workspaceFromStaffType,
  workspaceHome,
} from "@/features/access/workspace";

describe("mobile navigation", () => {
  it("opens the doctor, nurse, and patient homes", () => {
    expect(workspaceFromStaffType("doctor")).toBe("doctor");
    expect(workspaceFromStaffType("nurse")).toBe("nurse");
    expect(workspaceFromStaffType("other")).toBeNull();
    expect(workspaceFromPermissions(["prescriptions.view"])).toBe("doctor");
    expect(workspaceFromPermissions(["encounters.view"])).toBe("nurse");
    expect(workspaceFromPermissions(["appointments.view"])).toBe("patient");
    expect(workspaceHome("doctor")).toBe("/doctor");
    expect(workspaceHome("nurse")).toBe("/nurse");
    expect(workspaceHome("patient")).toBe("/patient");
  });

  it("hides destinations the account cannot view", () => {
    const visible = destinationsFor("doctor")
      .filter((item) => allowed([], item.permission))
      .map((item) => item.label);
    expect(visible).toEqual([]);
    const nurse = destinationsFor("nurse")
      .filter((item) => allowed(["appointments.view"], item.permission))
      .map((item) => item.label);
    expect(nurse).toEqual(["Queue", "Vital signs"]);
  });
});
