"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Account, Tokens } from "@/lib/api/types";
import { recallAccount, rememberAccount } from "@/offline/repositories/cache-repository";
import { clearOfflineWork } from "@/offline/repositories/clear";
import { normalizeAccount } from "@/lib/auth/normalize-account";
import { reconcileSession } from "@/lib/auth/session-sync";
import {
  clearSessionCookie,
  clearStoredSession,
  getAccessToken,
  getStoredBranchId,
  markSessionCookie,
  storeBranchId,
  storeTokens,
} from "@/lib/auth/storage";

type AuthContextValue = {
  ready: boolean;
  account: Account | undefined;
  isLoading: boolean;
  error: Error | null;
  branchId: string | null;
  signIn: (email: string, password: string) => Promise<Account>;
  signOut: () => void;
  setBranchId: (branchId: string | null) => void;
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
    const sync = reconcileSession();
    const tokenPresent = sync === "cleared_stale_cookie" ? false : Boolean(getAccessToken());
    setHasToken(tokenPresent);
    setBranchState(getStoredBranchId());
    setReady(true);
  }, []);

  function applyBranchSelection(nextBranchId: string | null) {
    storeBranchId(nextBranchId);
    setBranchState(nextBranchId);
    void queryClient.invalidateQueries();
  }

  const accountQuery = useQuery({
    queryKey: ["auth", "me", branchId],
    enabled: ready && hasToken,
    queryFn: async () => {
      try {
        const account = normalizeAccount(await api<Account>("/auth/me/"));
        await rememberAccount(branchId, account);
        return account;
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) {
          const cached = await recallAccount<Account>(branchId);
          if (cached) {
            return normalizeAccount(cached.payload);
          }
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    const account = accountQuery.data;
    if (!account) {
      return;
    }

    const assignedBranches = account.assigned_branches;
    const assignedIds = new Set(assignedBranches.map((branch) => branch.id));

    if (account.resolved_branch_id && account.resolved_branch_id !== branchId) {
      applyBranchSelection(account.resolved_branch_id);
      return;
    }

    if (branchId && assignedIds.size > 0 && !assignedIds.has(branchId)) {
      applyBranchSelection(null);
      return;
    }

    if (account.requires_branch_selection && assignedBranches.length === 1 && !branchId) {
      applyBranchSelection(assignedBranches[0].id);
    }
  }, [accountQuery.data, branchId, queryClient]);

  const value: AuthContextValue = {
    ready,
    account: accountQuery.data ? normalizeAccount(accountQuery.data) : undefined,
    isLoading: !ready || (hasToken && accountQuery.isPending),
    error: accountQuery.error instanceof Error ? accountQuery.error : null,
    branchId,
    signIn: async (email: string, password: string) => {
      const tokens = await api<Tokens>("/auth/token/", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      storeTokens(tokens.access, tokens.refresh);
      markSessionCookie();
      setHasToken(true);
      const account = normalizeAccount(await api<Account>("/auth/me/"));
      await rememberAccount(branchId, account);
      queryClient.setQueryData(["auth", "me", branchId], account);
      return account;
    },
    signOut: () => {
      clearStoredSession();
      clearSessionCookie();
      void clearOfflineWork();
      setHasToken(false);
      setBranchState(null);
      queryClient.clear();
      router.replace("/login");
    },
    setBranchId: applyBranchSelection,
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
