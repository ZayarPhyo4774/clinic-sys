"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { allowed, safeNextPath } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api/errors";
import { getAccessToken } from "@/lib/auth/storage";
import { QueryState, describeError } from "@/components/query-state";

export function RequirePermission({
  permission,
  title,
  children,
}: {
  permission: string | null;
  title: string;
  children: React.ReactNode;
}) {
  const { isLoading, error, account, refetchAccount, branchId, setBranchId, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || isLoading || account || getAccessToken()) {
      return;
    }
    router.replace(`/login?next=${encodeURIComponent(safeNextPath(pathname))}`);
  }, [account, isLoading, pathname, ready, router]);

  if (isLoading) {
    return <QueryState status="loading" />;
  }

  if (error) {
    const denied = error instanceof ApiError && error.status === 403;
    return (
      <div className="space-y-4">
        <QueryState
          status="error"
          detail={describeError(error)}
          onRetry={() => refetchAccount()}
        />
        {denied && branchId ? (
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setBranchId(null)}
          >
            Clear the selected branch and load the account again
          </button>
        ) : null}
      </div>
    );
  }

  if (!account) {
    if (ready && !getAccessToken()) {
      return <QueryState status="loading" />;
    }
    return <QueryState status="forbidden" title={title} />;
  }

  if (!allowed(account.permissions, permission)) {
    return <QueryState status="forbidden" title={title} />;
  }

  return children;
}
