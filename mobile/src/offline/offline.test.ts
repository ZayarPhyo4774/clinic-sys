import { describe, expect, it } from "vitest";

import { displayStatus } from "@/offline/connectivity/status";
import { clinicalFieldsDiffer, sameClinicalValue } from "@/offline/conflict/compare";
import { classifySyncError } from "@/offline/conflict/classify";
import { mutationAllowed, readSupported, requireOnlineMutation } from "@/offline/sync/policy";
import { delayMs, isDue } from "@/offline/sync/schedule";
import { ApiError } from "@/lib/api/errors";

describe("mobile offline and synchronization", () => {
  it("keeps stock, queue, and registration online-only", () => {
    expect(readSupported("patients")).toBe(true);
    expect(readSupported("invoices")).toBe(false);
    expect(mutationAllowed("vitals.record")).toBe(true);
    expect(mutationAllowed("pharmacy.dispense")).toBe(false);
    expect(() => requireOnlineMutation("pharmacy.dispense", false)).toThrow(/stock/);
    expect(() => requireOnlineMutation("patients.register", false)).toThrow(/patient number/);
    expect(() => requireOnlineMutation("vitals.record", false)).not.toThrow();
  });

  it("shows Offline while the network is down and retries a lost response", () => {
    expect(displayStatus({ online: false, syncing: true, pending: 1, failed: 0, sawSync: true })).toBe("Offline");
    expect(classifySyncError(new ApiError(0, "offline", "network", {}))).toBe("retry");
    expect(classifySyncError(new ApiError(409, "conflict", "conflict", {}))).toBe("conflict");
  });

  it("backs off and does not send a failed operation again after five attempts", () => {
    expect(delayMs(0)).toBe(30_000);
    expect(delayMs(1)).toBe(60_000);
    expect(delayMs(10)).toBe(300_000);
    const now = Date.parse("2026-10-01T00:00:00Z");
    expect(isDue({ status: "pending", retryCount: 0, nextAttemptAt: null }, now)).toBe(true);
    expect(
      isDue({ status: "pending", retryCount: 1, nextAttemptAt: "2026-10-01T00:01:00Z" }, now),
    ).toBe(false);
    expect(isDue({ status: "failed", retryCount: 5, nextAttemptAt: null }, now)).toBe(false);
    expect(isDue({ status: "synced", retryCount: 0, nextAttemptAt: null }, now)).toBe(false);
  });

  it("does not treat a rounded measurement as a different clinical value", () => {
    expect(sameClinicalValue("37.2000", 37.2)).toBe(true);
    expect(sameClinicalValue("", null)).toBe(true);
    expect(
      clinicalFieldsDiffer({ temperature: "37.2", pulse: 80 }, { temperature: "36.5", pulse: 80 }, [
        "temperature",
        "pulse",
      ]),
    ).toBe(true);
  });
});
