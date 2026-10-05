import type { QueryClient } from "@tanstack/react-query";

import type { Page, QueueEntry } from "@/lib/api/types";

type CachedQueuePage = {
  page: Page<QueueEntry>;
  fromCache: boolean;
};

function isCachedQueuePage(value: unknown): value is CachedQueuePage {
  return Boolean(value && typeof value === "object" && "page" in value);
}

export function patchQueueEntry(queryClient: QueryClient, entryId: string, patch: Partial<QueueEntry>) {
  queryClient.setQueriesData({ queryKey: ["queue"] }, (current: unknown) => {
    if (Array.isArray(current)) {
      const next = current.map((row) =>
        row.id === entryId ? ({ ...row, ...patch } as QueueEntry) : row,
      );
      if (next.every((row, index) => row === current[index])) {
        return current;
      }
      return next;
    }

    if (!isCachedQueuePage(current) || !current.page?.results) {
      return current;
    }

    const results = current.page.results.map((row) => (row.id === entryId ? { ...row, ...patch } : row));
    if (results.every((row, index) => row === current.page.results[index])) {
      return current;
    }
    return {
      ...current,
      page: {
        ...current.page,
        results,
      },
    };
  });

  queryClient.setQueriesData<QueueEntry>({ queryKey: ["queue", "detail"] }, (current) =>
    current?.id === entryId ? { ...current, ...patch } : current,
  );
}

export async function refreshQueueQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ["queue"] });
  await queryClient.refetchQueries({ queryKey: ["queue"], type: "active" });
}
