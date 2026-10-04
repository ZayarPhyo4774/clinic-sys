import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiError } from "@/lib/api/errors";
import { AuthProvider } from "@/features/auth/auth-provider";
import { SyncProvider } from "@/offline/connectivity/sync-provider";
import { openDatabase } from "@/offline/database/sqlite";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    openDatabase();
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: (count, error) => {
            if (error instanceof ApiError && [0, 401, 403, 404].includes(error.status)) {
              return false;
            }
            return count < 1;
          },
        },
      },
    });
  });

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SyncProvider>{children}</SyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
