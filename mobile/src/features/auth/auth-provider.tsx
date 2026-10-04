import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";

import { api, setMemoryBranch, setMemorySession, setSessionExpiredHandler, setTokenPersistor, withQuery } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Account, Page, StaffRecord } from "@/lib/api/types";
import { clearStoredSession, readStoredSession, storeBranchId, storeTokens } from "@/lib/auth/storage";
import { accountCacheKey, readCache, writeCache } from "@/offline/repositories/cache-repository";
import { clearOfflineWork } from "@/offline/repositories/clear";
import {
  workspaceFromPermissions,
  workspaceFromStaffType,
  type Workspace,
} from "@/features/access/workspace";

type AuthContextValue = {
  ready: boolean;
  account: Account | undefined;
  workspace: Workspace;
  isLoading: boolean;
  error: Error | null;
  branchId: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setBranchId: (branchId: string | null) => Promise<void>;
  refetchAccount: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [branchId, setBranchState] = useState<string | null>(null);

  useEffect(() => {
    setTokenPersistor((access, refresh) => {
      void storeTokens(access, refresh);
    });
    setSessionExpiredHandler(() => {
      void clearStoredSession();
      setHasToken(false);
      setBranchState(null);
      queryClient.clear();
      router.replace("/login");
    });
    void readStoredSession().then((stored) => {
      setMemorySession(stored.access, stored.refresh);
      setMemoryBranch(stored.branchId);
      setBranchState(stored.branchId);
      setHasToken(Boolean(stored.access));
      setReady(true);
    });
    return () => {
      setTokenPersistor(null);
      setSessionExpiredHandler(null);
    };
  }, [queryClient, router]);

  const accountQuery = useQuery({
    queryKey: ["auth", "me", branchId],
    enabled: ready && hasToken,
    queryFn: async () => {
      try {
        const account = await api<Account>("/auth/me/");
        writeCache(accountCacheKey(branchId), account);
        return account;
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) {
          const cached = readCache<Account>(accountCacheKey(branchId));
          if (cached) {
            return cached;
          }
        }
        throw error;
      }
    },
  });

  const canReadStaff = Boolean(accountQuery.data?.permissions.includes("staff.view"));
  const staffQuery = useQuery({
    queryKey: ["auth", "staff", accountQuery.data?.email, branchId],
    enabled: ready && canReadStaff,
    queryFn: async () => {
      const path = withQuery("/staff/", { search: accountQuery.data?.email, page_size: "20" });
      const key = `staff:${branchId ?? ""}:${accountQuery.data?.email ?? ""}`;
      try {
        const page = await api<Page<StaffRecord>>(path);
        writeCache(key, page);
        return page;
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) {
          const cached = readCache<Page<StaffRecord>>(key);
          if (cached) {
            return cached;
          }
        }
        throw error;
      }
    },
  });

  const staffType =
    staffQuery.data?.results.find((row) => row.user === accountQuery.data?.id && row.is_active)?.staff_type ?? null;
  const workspace =
    workspaceFromStaffType(staffType) ?? workspaceFromPermissions(accountQuery.data?.permissions ?? []);
  const waitingForStaff = canReadStaff && staffQuery.isLoading;

  const value: AuthContextValue = {
    ready,
    account: accountQuery.data,
    workspace,
    isLoading: !ready || (hasToken && (accountQuery.isLoading || waitingForStaff)),
    error: accountQuery.error instanceof Error ? accountQuery.error : null,
    branchId,
    signIn: async (email, password) => {
      const tokens = await api<{ access: string; refresh: string }>("/auth/token/", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      setMemorySession(tokens.access, tokens.refresh);
      await storeTokens(tokens.access, tokens.refresh);
      setHasToken(true);
    },
    signOut: async () => {
      clearOfflineWork();
      setMemorySession(null, null);
      setMemoryBranch(null);
      await clearStoredSession();
      setHasToken(false);
      setBranchState(null);
      queryClient.clear();
      router.replace("/login");
    },
    setBranchId: async (nextBranchId) => {
      setMemoryBranch(nextBranchId);
      await storeBranchId(nextBranchId);
      setBranchState(nextBranchId);
      await queryClient.invalidateQueries();
    },
    refetchAccount: () => {
      void accountQuery.refetch();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return value;
}
