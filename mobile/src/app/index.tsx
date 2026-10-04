import { Redirect } from "expo-router";

import { ErrorState, LoadingState } from "@/components/states";
import { workspaceHome } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";

export default function Index() {
  const { ready, isLoading, account, workspace, error, refetchAccount } = useAuth();
  if (!ready || isLoading) {
    return <LoadingState />;
  }
  if (error || !account) {
    if (!account && !error) {
      return <Redirect href="/login" />;
    }
    return <ErrorState error={error} onRetry={() => refetchAccount()} />;
  }
  return <Redirect href={workspaceHome(workspace)} />;
}
