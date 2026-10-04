import { afterEach, describe, expect, it } from "vitest";

import { hasSessionCookie, reconcileSession } from "@/lib/auth/session-sync";
import { SESSION_COOKIE, storeTokens } from "@/lib/auth/storage";

const storage = new Map<string, string>();

function resetBrowserState() {
  storage.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "" },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

describe("reconcileSession", () => {
  it("clears a stale cookie when tokens are missing", () => {
    resetBrowserState();
    document.cookie = `${SESSION_COOKIE}=1; Path=/; SameSite=Lax`;
    expect(reconcileSession()).toBe("cleared_stale_cookie");
    expect(hasSessionCookie()).toBe(false);
  });

  it("restores the cookie when tokens exist", () => {
    resetBrowserState();
    storeTokens("access-token", "refresh-token");
    expect(reconcileSession()).toBe("restored_cookie");
    expect(hasSessionCookie()).toBe(true);
  });
});
