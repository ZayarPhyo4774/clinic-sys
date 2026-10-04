import { ApiError } from "@/lib/api/errors";
import {
  clearSessionCookie,
  clearStoredSession,
  getAccessToken,
  getRefreshToken,
  getStoredBranchId,
  storeTokens,
} from "@/lib/auth/storage";

const BASE = "/api/v1";

type RequestOptions = RequestInit & {
  auth?: boolean;
};

let refreshTask: Promise<boolean> | null = null;

function redirectToLogin() {
  clearStoredSession();
  clearSessionCookie();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

async function refreshAccess(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) {
    return false;
  }
  const response = await fetch(`${BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) {
    return false;
  }
  const payload = (await response.json()) as { access?: string; refresh?: string };
  if (!payload.access) {
    return false;
  }
  storeTokens(payload.access, payload.refresh || refresh);
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
    const access = getAccessToken();
    if (access) {
      headers.set("Authorization", `Bearer ${access}`);
    }
    const branchId = getStoredBranchId();
    if (branchId) {
      headers.set("X-Branch-Id", branchId);
    }
  }

  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  if (response.status === 401 && options.auth !== false && allowRefresh) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return send(path, options, false);
    }
    redirectToLogin();
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
