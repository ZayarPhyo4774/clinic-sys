const ACCESS_KEY = "cs_access";
const REFRESH_KEY = "cs_refresh";
const BRANCH_KEY = "cs_branch";

export const SESSION_COOKIE = "cs_session";

function storage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage;
}

export function getAccessToken() {
  return storage()?.getItem(ACCESS_KEY) ?? null;
}

export function getRefreshToken() {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}

export function getStoredBranchId() {
  return storage()?.getItem(BRANCH_KEY) ?? null;
}

export function storeTokens(access: string, refresh: string) {
  const store = storage();
  store?.setItem(ACCESS_KEY, access);
  store?.setItem(REFRESH_KEY, refresh);
}

export function storeBranchId(branchId: string | null) {
  const store = storage();
  if (!store) {
    return;
  }
  if (branchId) {
    store.setItem(BRANCH_KEY, branchId);
  } else {
    store.removeItem(BRANCH_KEY);
  }
}

export function clearStoredSession() {
  const store = storage();
  store?.removeItem(ACCESS_KEY);
  store?.removeItem(REFRESH_KEY);
  store?.removeItem(BRANCH_KEY);
}

export function markSessionCookie() {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${SESSION_COOKIE}=1; Path=/; SameSite=Lax`;
}

export function clearSessionCookie() {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
