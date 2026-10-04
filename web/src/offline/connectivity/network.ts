export function isOnline() {
  if (typeof navigator === "undefined") {
    return true;
  }
  return navigator.onLine;
}

export function subscribeConnectivity(listener: (online: boolean) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const online = () => listener(true);
  const offline = () => listener(false);
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
  };
}
