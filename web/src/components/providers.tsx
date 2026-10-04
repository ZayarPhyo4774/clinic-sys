"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api/errors";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/features/auth/auth-provider";
import { SyncProvider } from "@/offline/connectivity/sync-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) => {
              if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
                return false;
              }
              return count < 1;
            },
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SyncProvider>
            {children}
            <Toaster richColors closeButton />
          </SyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
