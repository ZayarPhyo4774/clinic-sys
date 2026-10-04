import { describe, expect, it } from "vitest";

import {
  labAddTestAllowed,
  labCancelAllowed,
  labReportAllowed,
  labWorkflowActionsForStatus,
} from "@/features/laboratory/lab-order-writes";

describe("lab workflow actions", () => {
  it("collects after ordering", () => {
    expect(labWorkflowActionsForStatus("ordered")).toEqual(["collect"]);
  });

  it("processes after sample collection", () => {
    expect(labWorkflowActionsForStatus("sample_collected")).toEqual(["process"]);
  });

  it("completes after processing", () => {
    expect(labWorkflowActionsForStatus("processing")).toEqual(["complete"]);
  });

  it("allows cancel before results exist", () => {
    expect(labCancelAllowed("ordered", false)).toBe(true);
    expect(labCancelAllowed("processing", true)).toBe(false);
  });

  it("allows report after completion", () => {
    expect(labReportAllowed("completed", null)).toBe(true);
    expect(labReportAllowed("completed", "2026-01-01T00:00:00Z")).toBe(false);
  });

  it("allows adding tests while ordered or collected", () => {
    expect(labAddTestAllowed("ordered")).toBe(true);
    expect(labAddTestAllowed("sample_collected")).toBe(true);
    expect(labAddTestAllowed("processing")).toBe(false);
  });
});
