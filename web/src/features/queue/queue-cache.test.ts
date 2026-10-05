import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { patchQueueEntry } from "@/features/queue/queue-cache";
import type { Page, QueueEntry } from "@/lib/api/types";

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: "entry-1",
    appointment: "appt-1",
    appointment_status: "checked_in",
    encounter: null,
    patient: "patient-1",
    doctor: "doctor-1",
    service_date: "2026-10-06",
    position: 1,
    status: "waiting",
    triage_started_at: null,
    vitals_recorded_at: null,
    ...overrides,
  };
}

describe("patchQueueEntry", () => {
  it("updates queue list cache entries", () => {
    const queryClient = new QueryClient();
    const entry = makeEntry();
    queryClient.setQueryData(["queue", { search: "", page: 1, branchId: "branch-1", listParams: undefined }], {
      page: { count: 1, next: null, previous: null, results: [entry] } satisfies Page<QueueEntry>,
      fromCache: false,
    });

    patchQueueEntry(queryClient, "entry-1", {
      vitals_recorded_at: "2026-10-06T10:00:00.000Z",
    });

    const cached = queryClient.getQueryData<{ page: Page<QueueEntry> }>([
      "queue",
      { search: "", page: 1, branchId: "branch-1", listParams: undefined },
    ]);
    expect(cached?.page.results[0]?.vitals_recorded_at).toBe("2026-10-06T10:00:00.000Z");
  });
});
