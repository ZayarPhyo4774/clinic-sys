"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";
import { api } from "@/lib/api/client";

export function ToggleActiveButton({
  path,
  active,
  resource,
  label,
}: {
  path: string;
  active: boolean;
  resource: string;
  label: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation(`${resource}.toggle_active`, isOnline());
      return api(path, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !active }),
      });
    },
    onSuccess: async () => {
      toast.success(`${label} ${active ? "deactivated" : "activated"}.`);
      await queryClient.invalidateQueries({ queryKey: [resource] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The update was rejected.");
    },
  });

  return (
    <Button type="button" size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? "Saving…" : active ? "Deactivate" : "Activate"}
    </Button>
  );
}
