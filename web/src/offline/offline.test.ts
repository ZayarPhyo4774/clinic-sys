import { describe, expect, it } from "vitest";

import { displayStatus } from "@/offline/connectivity/status";
import { classifySyncError } from "@/offline/conflict/classify";
import { readResourceFor, requireOnlineMutation } from "@/offline/sync/policy";
import { ApiError } from "@/lib/api/errors";

describe("web offline behavior", () => {
  it("caches supported reads and leaves invoices online-only", () => {
    expect(readResourceFor("/patients/?page=1")).toBe("patients");
    expect(readResourceFor("/queue-entries/")).toBe("queue");
    expect(readResourceFor("/invoices/")).toBeNull();
  });

  it("refuses registration and queue changes while the network is down", () => {
    expect(() => requireOnlineMutation("patients.register", false)).toThrow(/patient number/);
    expect(() => requireOnlineMutation("queue.call", false)).toThrow(/queue position/);
    expect(() => requireOnlineMutation("patients.register", true)).not.toThrow();
  });

  it("allows offline vitals and consultation notes", () => {
    expect(() => requireOnlineMutation("vitals.record", false)).not.toThrow();
    expect(() => requireOnlineMutation("consultation.note", false)).not.toThrow();
    expect(() => requireOnlineMutation("encounters.complete", false)).toThrow(/connection/);
  });

  it("shows Offline during an interruption and retries a lost response", () => {
    expect(
      displayStatus({ online: false, syncing: false, pending: 1, failed: 0, sawSync: false }),
    ).toBe("Offline");
    expect(classifySyncError(new ApiError(0, "The clinic API could not be reached.", "network", {}))).toBe("retry");
    expect(classifySyncError(new ApiError(409, "Conflict.", "conflict", {}))).toBe("conflict");
  });
});
