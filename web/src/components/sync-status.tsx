"use client";

import { Button } from "@/components/ui/button";
import { useSyncStatus } from "@/offline/connectivity/sync-provider";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, { dot: string; badge: string }> = {
  Synced: { dot: "bg-success", badge: "bg-success/12 text-success" },
  Syncing: { dot: "bg-info animate-pulse", badge: "bg-info/12 text-info" },
  Offline: { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
  Failed: { dot: "bg-destructive", badge: "bg-destructive/12 text-destructive" },
};

export function SyncStatus() {
  const { status, failed, retry, retrying } = useSyncStatus();
  const styles = statusStyles[status] ?? statusStyles.Offline;

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
          styles.badge,
        )}
      >
        <span className={cn("size-1.5 rounded-full", styles.dot)} aria-hidden="true" />
        {status}
      </span>
      {status === "Failed" ? (
        <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={() => void retry()}>
          {retrying ? "Retrying…" : `Retry${failed > 0 ? ` ${failed}` : ""}`}
        </Button>
      ) : null}
    </div>
  );
}
