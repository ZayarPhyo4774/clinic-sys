import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { storeBranchId, storeTokens } from "@/lib/auth/storage";

const memory = new Map<string, string>();

function installBrowser() {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
    location: { pathname: "/patients", assign: vi.fn() },
  });
  vi.stubGlobal("document", { cookie: "" });
}

afterEach(() => {
  memory.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API client", () => {
  it("sends the access token and the selected branch", async () => {
    installBrowser();
    storeTokens("access-token", "refresh-token");
    storeBranchId("branch-1");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 1, results: [{ id: "patient-1" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const page = await api<{ count: number }>("/patients/");
    expect(page.count).toBe(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("X-Branch-Id")).toBe("branch-1");
  });

  it("returns the permission error from the API", async () => {
    installBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "permission_denied", detail: "You do not have permission.", fields: {} }), {
          status: 403,
        }),
      ),
    );
    await expect(api("/invoices/")).rejects.toMatchObject({
      status: 403,
      code: "permission_denied",
    });
  });

  it("reports a network interruption without inventing a response", async () => {
    installBrowser();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await api("/patients/").then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "network" });
  });
});
