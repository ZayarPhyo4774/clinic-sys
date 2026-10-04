"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { displayStatus, type SyncDisplay } from "@/offline/connectivity/status";
import { isOnline, subscribeConnectivity } from "@/offline/connectivity/network";
import { outboxCounts, retryFailed, runSync, subscribeOutbox, syncInProgress } from "@/offline/sync/worker";

type Snapshot = {
  status: SyncDisplay;
  failed: number;
};

let snapshot: Snapshot = { status: "Online", failed: 0 };
let sawSync = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function publish(next: Snapshot) {
  snapshot = next;
  emit();
}

async function refresh(syncing: boolean) {
  const counts = await outboxCounts();
  publish({
    status: displayStatus({
      online: isOnline(),
      syncing: syncing || syncInProgress(),
      pending: counts.pending,
      failed: counts.failed,
      sawSync,
    }),
    failed: counts.failed,
  });
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();

  useEffect(() => {
    let timer = 0;
    const kick = () => {
      if (!isOnline()) {
        void refresh(false);
        return;
      }
      void refresh(true);
      void runSync().finally(() => {
        sawSync = true;
        void refresh(false);
      });
    };
    kick();
    const stopConnectivity = subscribeConnectivity(() => kick());
    const stopOutbox = subscribeOutbox(() => {
      void refresh(syncInProgress());
    });
    timer = window.setInterval(() => {
      if (isOnline()) {
        void runSync().finally(() => {
          sawSync = true;
          void refresh(false);
        });
      }
    }, 30_000);
    return () => {
      stopConnectivity();
      stopOutbox();
      window.clearInterval(timer);
    };
  }, [account?.id]);

  return children;
}

export function useSyncStatus() {
  const status = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot.status,
    () => "Online" as SyncDisplay,
  );
  const failed = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot.failed,
    () => 0,
  );
  const [retrying, setRetrying] = useState(false);

  return {
    status,
    failed,
    retry: async () => {
      setRetrying(true);
      try {
        await retryFailed();
        sawSync = true;
        await refresh(false);
      } finally {
        setRetrying(false);
      }
    },
    retrying,
  };
}
