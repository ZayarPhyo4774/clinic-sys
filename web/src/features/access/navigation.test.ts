import { describe, expect, it } from "vitest";

import {
  allowed,
  canAccessOperator,
  navigation,
  navigationFor,
  OPERATOR_HREF,
  postSignInPath,
  safeNextPath,
} from "@/features/access/navigation";

describe("permission navigation", () => {
  it("shows only the screens the account can view", () => {
    const permissions = ["patients.view", "appointments.view"];
    const labels = navigation.filter((item) => allowed(permissions, item.permission)).map((item) => item.label);
    expect(labels).toEqual(["Dashboard", "Patients", "Appointments", "Queue", "Schedules", "Settings"]);
  });

  it("does not treat a create code as permission to open the list", () => {
    expect(allowed(["patients.create"], "patients.view")).toBe(false);
    expect(allowed(["billing.view"], "billing.view")).toBe(true);
  });

  it("keeps the operator console out of clinic navigation", () => {
    expect(navigation.some((item) => item.href === OPERATOR_HREF)).toBe(false);
    expect(navigationFor(["patients.view"]).some((item) => item.href === OPERATOR_HREF)).toBe(false);
    expect(canAccessOperator(true)).toBe(true);
    expect(canAccessOperator(false)).toBe(false);
  });

  it("shows admin screens when the matching permissions are granted", () => {
    const permissions = [
      "users.manage",
      "roles.manage",
      "reports.view",
      "audit.view",
      "billing.view",
      "branches.view",
      "departments.view",
      "staff.view",
      "appointments.view",
    ];
    const labels = navigationFor(permissions).map((item) => item.label);
    expect(labels).toContain("Users");
    expect(labels).toContain("Roles");
    expect(labels).toContain("Reports");
    expect(labels).toContain("Audit Logs");
    expect(labels).toContain("Billing");
    expect(labels).toContain("Branches");
    expect(labels).toContain("Departments");
    expect(labels).toContain("Staff");
    expect(labels).toContain("Schedules");
  });

  it("keeps the next path inside the app", () => {
    expect(safeNextPath("/patients")).toBe("/patients");
    expect(safeNextPath("https://example.test")).toBe("/");
    expect(safeNextPath("//example.test")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
  });

  it("sends superusers to the operator console by default", () => {
    expect(postSignInPath({ is_superuser: true }, null)).toBe(OPERATOR_HREF);
    expect(postSignInPath({ is_superuser: true }, "/")).toBe(OPERATOR_HREF);
    expect(postSignInPath({ is_superuser: true }, "/patients")).toBe("/patients");
    expect(postSignInPath({ is_superuser: false }, null)).toBe("/");
    expect(postSignInPath({ is_superuser: false }, "/patients")).toBe("/patients");
  });
});
