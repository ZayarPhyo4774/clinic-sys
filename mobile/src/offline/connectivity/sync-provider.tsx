import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { useAuth } from "@/features/auth/auth-provider";
import { isOnline, refreshOnline, subscribeConnectivity } from "@/offline/connectivity/network";
import { displayStatus, type SyncDisplay } from "@/offline/connectivity/status";
import { outboxCounts, retryFailed, runSync, subscribeOutbox, syncInProgress } from "@/offline/sync/worker";

type Snapshot = { status: SyncDisplay; failed: number };

let sawSync = false;
let currentUserId: string | null = null;
let snapshot: Snapshot = { status: "Online", failed: 0 };
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function refreshSnapshot(syncing: boolean) {
  const counts = outboxCounts(currentUserId);
  publish(
    displayStatus({
      online: isOnline(),
      syncing,
      pending: counts.pending,
      failed: counts.failed,
      sawSync,
    }) === snapshot.status && counts.failed === snapshot.failed
      ? snapshot
      : {
          status: displayStatus({
            online: isOnline(),
            syncing,
            pending: counts.pending,
            failed: counts.failed,
            sawSync,
          }),
          failed: counts.failed,
        },
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const userId = account?.id ?? null;

  useEffect(() => {
    currentUserId = userId;
    let timer: ReturnType<typeof setInterval> | undefined;
    const kick = async () => {
      const online = await refreshOnline();
      if (!online || !userId) {
        refreshSnapshot(false);
        return;
      }
      refreshSnapshot(true);
      await runSync(userId);
      sawSync = true;
      refreshSnapshot(false);
    };
    void kick();
    const stopNet = subscribeConnectivity((online) => {
      if (online) {
        void kick();
      } else {
        refreshSnapshot(false);
      }
    });
    const stopBox = subscribeOutbox(() => {
      refreshSnapshot(syncInProgress());
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void kick();
      }
    });
    timer = setInterval(() => {
      if (isOnline() && userId) {
        void runSync(userId);
      }
    }, 30_000);
    return () => {
      if (timer) {
        clearInterval(timer);
      }
      stopNet();
      stopBox();
      appState.remove();
    };
  }, [userId]);

  return children;
}

export function useSyncStatus() {
  const status = useSyncExternalStore(
    subscribe,
    () => snapshot.status,
    () => "Online" as SyncDisplay,
  );
  const failed = useSyncExternalStore(
    subscribe,
    () => snapshot.failed,
    () => 0,
  );
  return { status, failed, retry: (userId: string | null) => retryFailed(userId) };
}
