"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import type { Encounter, Page } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function StartConsultationButton({
  appointmentId,
  appointmentStatus,
  encounter,
  size = "sm",
  variant = "default",
}: {
  appointmentId: string;
  appointmentStatus: string;
  encounter?: Encounter | null;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const { account, branchId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canCreate = Boolean(account && allowed(account.permissions, "encounters.create"));
  const canView = Boolean(account && allowed(account.permissions, "encounters.view"));
  const shouldResolveEncounter = !encounter && appointmentStatus === "in_consultation" && canView;

  const encounterQuery = useQuery({
    queryKey: ["encounters", "appointment", appointmentId, branchId],
    enabled: shouldResolveEncounter,
    queryFn: async () => {
      const page = await api<Page<Encounter>>(withQuery("/encounters/", { appointment: appointmentId }));
      return page.results[0] ?? null;
    },
  });

  const resolvedEncounter = encounter ?? encounterQuery.data ?? null;

  const startMutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("encounters.start", isOnline());
      return api<Encounter>("/encounters/", {
        method: "POST",
        body: JSON.stringify({ appointment: appointmentId }),
      });
    },
    onSuccess: async (created) => {
      toast.success("Consultation started.");
      await queryClient.invalidateQueries({ queryKey: ["encounters"] });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      router.push(`/consultation/${created.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The consultation could not be started.");
    },
  });

  if (resolvedEncounter && canView) {
    return (
      <Button asChild size={size} variant={variant}>
        <Link href={`/consultation/${resolvedEncounter.id}`}>Open consultation</Link>
      </Button>
    );
  }

  if (appointmentStatus !== "in_consultation" || !canCreate) {
    return null;
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={startMutation.isPending || encounterQuery.isLoading}
      onClick={() => startMutation.mutate()}
    >
      {startMutation.isPending ? "Starting…" : "Start consultation"}
    </Button>
  );
}
