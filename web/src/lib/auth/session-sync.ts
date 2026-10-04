import {
  clearSessionCookie,
  getAccessToken,
  markSessionCookie,
  SESSION_COOKIE,
} from "@/lib/auth/storage";

export function hasSessionCookie() {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie.split(";").some((part) => part.trim() === `${SESSION_COOKIE}=1`);
}

export type SessionSyncResult = "ok" | "cleared_stale_cookie" | "restored_cookie";

/** Keep the middleware cookie and API tokens aligned in this browser tab. */
export function reconcileSession(): SessionSyncResult {
  const hasToken = Boolean(getAccessToken());
  const hasCookie = hasSessionCookie();

  if (hasCookie && !hasToken) {
    clearSessionCookie();
    return "cleared_stale_cookie";
  }

  if (hasToken && !hasCookie) {
    markSessionCookie();
    return "restored_cookie";
  }

  return "ok";
}
