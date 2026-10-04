import * as Network from "expo-network";
import type { NetworkState } from "expo-network";

let onlineFlag = true;
let watching = false;
const listeners = new Set<(online: boolean) => void>();

function apply(state: NetworkState) {
  const next = state.isConnected !== false && state.isInternetReachable !== false;
  const changed = next !== onlineFlag;
  onlineFlag = next;
  if (!changed) {
    return;
  }
  for (const listener of listeners) {
    listener(next);
  }
}

function watch() {
  if (watching) {
    return;
  }
  watching = true;
  Network.addNetworkStateListener((state) => {
    apply(state);
  });
}

export function isOnline() {
  return onlineFlag;
}

export async function refreshOnline() {
  watch();
  try {
    apply(await Network.getNetworkStateAsync());
  } catch {
    onlineFlag = true;
  }
  return onlineFlag;
}

export function subscribeConnectivity(listener: (online: boolean) => void) {
  watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
