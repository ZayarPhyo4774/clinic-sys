import { Redirect } from "expo-router";

import { ErrorState, LoadingState, MessageState } from "@/components/states";
import { allowed, type Workspace } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";

export function RequirePermission({
  permission,
  title,
  children,
}: {
  permission: string | null;
  title: string;
  children: React.ReactNode;
}) {
  const { isLoading, error, account, refetchAccount } = useAuth();
  if (isLoading) {
    return <LoadingState />;
  }
  if (error || !account) {
    return <ErrorState error={error} onRetry={() => refetchAccount()} />;
  }
  if (!allowed(account.permissions, permission)) {
    return <MessageState title={title} detail="You do not have permission to open this page." />;
  }
  return children;
}

export function RequireWorkspace({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: React.ReactNode;
}) {
  const auth = useAuth();
  if (!auth.ready || auth.isLoading) {
    return <LoadingState />;
  }
  if (!auth.account) {
    return <Redirect href="/login" />;
  }
  if (auth.workspace !== workspace) {
    return <Redirect href={auth.workspace === "doctor" ? "/doctor" : auth.workspace === "nurse" ? "/nurse" : "/patient"} />;
  }
  return children;
}
