import Constants from "expo-constants";

import { ApiError } from "@/lib/api/errors";

type RequestOptions = RequestInit & {
  auth?: boolean;
};

type SessionExpiredHandler = () => void;

let accessToken: string | null = null;
let refreshToken: string | null = null;
let branchId: string | null = null;
let refreshTask: Promise<boolean> | null = null;
let onSessionExpired: SessionExpiredHandler | null = null;
let persistTokens: ((access: string, refresh: string) => void) | null = null;

export function setMemorySession(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
}

export function setMemoryBranch(nextBranchId: string | null) {
  branchId = nextBranchId;
}

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null) {
  onSessionExpired = handler;
}

export function setTokenPersistor(handler: ((access: string, refresh: string) => void) | null) {
  persistTokens = handler;
}

export function apiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const extra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof extra === "string" && extra.length > 0) {
    return extra.replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000/api/v1";
}

function expireSession() {
  accessToken = null;
  refreshToken = null;
  branchId = null;
  onSessionExpired?.();
}

async function refreshAccess() {
  if (!refreshToken) {
    return false;
  }
  const response = await fetch(`${apiBaseUrl()}/auth/token/refresh/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  if (!response.ok) {
    return false;
  }
  const payload = (await response.json()) as { access?: string; refresh?: string };
  if (!payload.access) {
    return false;
  }
  accessToken = payload.access;
  refreshToken = payload.refresh || refreshToken;
  persistTokens?.(accessToken, refreshToken);
  return true;
}

function refreshOnce() {
  if (!refreshTask) {
    refreshTask = refreshAccess().finally(() => {
      refreshTask = null;
    });
  }
  return refreshTask;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function fail(response: Response, body: unknown): never {
  if (body && typeof body === "object" && "detail" in body) {
    const envelope = body as {
      code?: string;
      detail?: string;
      fields?: Record<string, string[]>;
    };
    throw new ApiError(
      response.status,
      envelope.detail || "Request failed.",
      envelope.code || "error",
      envelope.fields ?? {},
    );
  }
  if (response.status === 404) {
    throw new ApiError(response.status, "This resource is not available.", "not_found", {});
  }
  throw new ApiError(response.status, "Request failed.", "error", {});
}

async function send(path: string, options: RequestOptions, allowRefresh: boolean): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false) {
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    if (branchId) {
      headers.set("X-Branch-Id", branchId);
    }
  }
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...options, headers });
  if (response.status === 401 && options.auth !== false && allowRefresh) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return send(path, options, false);
    }
    expireSession();
  }
  return response;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await send(path, options, true);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, "The clinic API could not be reached.", "network", {});
  }
  const body = await readBody(response);
  if (!response.ok) {
    fail(response, body);
  }
  return body as T;
}

export function withQuery(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function currentAccessToken() {
  return accessToken;
}

export function currentRefreshToken() {
  return refreshToken;
}
