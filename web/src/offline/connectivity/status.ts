export type SyncDisplay = "Online" | "Offline" | "Syncing" | "Synced" | "Failed";

export function displayStatus(input: {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  sawSync: boolean;
}): SyncDisplay {
  if (!input.online) {
    return "Offline";
  }
  if (input.syncing || input.pending > 0) {
    return "Syncing";
  }
  if (input.failed > 0) {
    return "Failed";
  }
  if (input.sawSync) {
    return "Synced";
  }
  return "Online";
}
