"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { QueryState, describeError } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequirePermission } from "@/features/access/require-permission";
import { api } from "@/lib/api/client";
import { formatWhen } from "@/lib/utils";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  kind: string;
  read_at: string | null;
  created_at: string;
};

type ListResponse = { results: NotificationRow[] };

export function NotificationsScreen() {
  return (
    <RequirePermission permission="notifications.view" title="Notifications">
      <NotificationsInbox />
    </RequirePermission>
  );
}

function NotificationsInbox() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<ListResponse>("/notifications/"),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => {
      requireOnlineMutation("notifications.read", isOnline());
      return api<NotificationRow>(`/notifications/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The notification could not be updated.");
    },
  });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Messages and alerts for your account.</p>
      </div>

      {notifications.isLoading ? <QueryState status="loading" /> : null}
      {notifications.isError ? (
        <QueryState status="error" detail={describeError(notifications.error)} onRetry={() => void notifications.refetch()} />
      ) : null}
      {notifications.data ? (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.data.results.map((row) => (
                <TableRow key={row.id} className={row.read_at ? undefined : "bg-accent/30"}>
                  <TableCell>{formatWhen(row.created_at)}</TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell className="max-w-md">{row.message || "—"}</TableCell>
                  <TableCell>{row.read_at ? "Read" : "Unread"}</TableCell>
                  <TableCell>
                    {!row.read_at ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(row.id)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {notifications.data.results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
