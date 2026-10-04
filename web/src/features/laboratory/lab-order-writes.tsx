"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { ActionBar } from "@/components/action-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LabTestSelect } from "@/components/entity-picker";
import { LabTestLabel } from "@/components/record-link";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api/client";
import type { LabOrder, LabOrderItem, LabResult } from "@/lib/api/types";
import { labOrderCreateSchema, labResultSchema, validateForm } from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

type LabWorkflowAction = "collect" | "process" | "complete";

const workflowLabels: Record<LabWorkflowAction, string> = {
  collect: "Collect sample",
  process: "Start processing",
  complete: "Complete order",
};

export function labWorkflowActionsForStatus(status: string): LabWorkflowAction[] {
  switch (status) {
    case "ordered":
      return ["collect"];
    case "sample_collected":
      return ["process"];
    case "processing":
      return ["complete"];
    default:
      return [];
  }
}

export function labCancelAllowed(status: string, hasResults: boolean): boolean {
  return !hasResults && ["ordered", "sample_collected", "processing"].includes(status);
}

export function labReportAllowed(status: string, reportedAt: string | null): boolean {
  return status === "completed" && !reportedAt;
}

export function labAddTestAllowed(status: string): boolean {
  return status === "ordered" || status === "sample_collected";
}

export function LabOrderWritePanel({
  order,
  items,
  resultsByItem = {},
  onUpdated,
}: {
  order: LabOrder;
  items: LabOrderItem[];
  resultsByItem?: Record<string, LabResult[]>;
  onUpdated: () => void;
}) {
  const { account } = useAuth();
  const canManage = Boolean(account && allowed(account.permissions, "laboratory.manage"));
  if (!canManage) {
    return null;
  }

  const hasResults = Object.values(resultsByItem).some((results) => results.length > 0);

  return (
    <div className="space-y-4">
      <LabWorkflowActions orderId={order.id} status={order.status} hasItems={items.length > 0} onUpdated={onUpdated} />
      <CancelLabOrderButton
        orderId={order.id}
        status={order.status}
        hasResults={hasResults}
        onUpdated={onUpdated}
      />
      <GenerateLabReportButton order={order} onUpdated={onUpdated} />
      {labAddTestAllowed(order.status) ? <AddLabTestForm orderId={order.id} onUpdated={onUpdated} /> : null}
      {items.map((item) => (
        <div key={item.id} className="space-y-2">
          <AddLabResultForm orderId={order.id} itemId={item.id} labTest={item.lab_test} onUpdated={onUpdated} />
          {(resultsByItem[item.id] ?? []).map((result) => (
            <VerifyResultButton
              key={result.id}
              orderId={order.id}
              itemId={item.id}
              labTest={item.lab_test}
              result={result}
              orderStatus={order.status}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function LabWorkflowActions({
  orderId,
  status,
  hasItems,
  onUpdated,
}: {
  orderId: string;
  status: string;
  hasItems: boolean;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const actions = labWorkflowActionsForStatus(status).filter((action) => action !== "collect" || hasItems);

  const mutation = useMutation({
    mutationFn: (action: LabWorkflowAction) => {
      requireOnlineMutation(`lab_orders.${action}`, isOnline());
      return api(`/lab-orders/${orderId}/${action}/`, { method: "POST", body: "{}" });
    },
    onSuccess: async (_data, action) => {
      toast.success(workflowLabels[action]);
      await queryClient.invalidateQueries({ queryKey: ["lab-orders"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The lab action was rejected.");
    },
  });

  if (actions.length === 0) {
    return null;
  }

  return (
    <ActionBar>
      {actions.map((action) => (
        <Button key={action} type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(action)}>
          {workflowLabels[action]}
        </Button>
      ))}
    </ActionBar>
  );
}

function CancelLabOrderButton({
  orderId,
  status,
  hasResults,
  onUpdated,
}: {
  orderId: string;
  status: string;
  hasResults: boolean;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const canCancel = labCancelAllowed(status, hasResults);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("lab_orders.cancel", isOnline());
      return api(`/lab-orders/${orderId}/cancel/`, { method: "POST", body: "{}" });
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Lab order cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["lab-orders"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The lab order could not be cancelled.");
    },
  });

  if (!canCancel) {
    return null;
  }

  return (
    <>
      <ActionBar>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Cancel order
        </Button>
      </ActionBar>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this lab order?"
        description="This is only allowed before any results have been recorded."
        confirmLabel="Cancel order"
        destructive
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

function GenerateLabReportButton({ order, onUpdated }: { order: LabOrder; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const canReport = labReportAllowed(order.status, order.reported_at);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("lab_orders.report", isOnline());
      return api(`/lab-orders/${order.id}/report/`, { method: "POST", body: "{}" });
    },
    onSuccess: async () => {
      toast.success("Lab report generated.");
      await queryClient.invalidateQueries({ queryKey: ["lab-orders"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The lab report could not be generated.");
    },
  });

  if (!canReport) {
    return null;
  }

  return (
    <ActionBar>
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Generating…" : "Generate report"}
      </Button>
    </ActionBar>
  );
}

function VerifyResultButton({
  orderId,
  itemId,
  labTest,
  result,
  orderStatus,
  onUpdated,
}: {
  orderId: string;
  itemId: string;
  labTest: string;
  result: LabResult;
  orderStatus: string;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const canVerify = orderStatus === "processing" && result.status === "active" && !result.verified_at;

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("lab_orders.verify", isOnline());
      return api(`/lab-orders/${orderId}/items/${itemId}/results/${result.id}/verify/`, {
        method: "POST",
        body: "{}",
      });
    },
    onSuccess: async () => {
      toast.success("Result verified.");
      await queryClient.invalidateQueries({ queryKey: ["lab-results"] });
      await queryClient.invalidateQueries({ queryKey: ["lab-orders"] });
      onUpdated();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The result could not be verified.");
    },
  });

  if (!canVerify) {
    return null;
  }

  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <span>
        Result {result.value} {result.unit} · <LabTestLabel id={labTest} />
      </span>
      <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Verifying…" : "Verify"}
      </Button>
    </div>
  );
}

function AddLabTestForm({ orderId, onUpdated }: { orderId: string; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [labTest, setLabTest] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("lab_orders.add_test", isOnline());
      return api(`/lab-orders/${orderId}/items/`, {
        method: "POST",
        body: JSON.stringify({ lab_test: labTest }),
      });
    },
    onSuccess: async () => {
      setLabTest("");
      setError(null);
      toast.success("Test added.");
      await queryClient.invalidateQueries({ queryKey: ["lab-order-items"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(labOrderCreateSchema, { lab_test: labTest }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="space-y-3 rounded-lg border bg-card p-4" onSubmit={onSubmit}>
      <p className="text-sm font-medium">Add test to order</p>
      <LabTestSelect id={`lab_test_${orderId}`} value={labTest} onValueChange={setLabTest} />
      <Button type="submit" size="sm" disabled={mutation.isPending}>
        {mutation.isPending ? "Adding…" : "Add test"}
      </Button>
      <FormFieldError error={error} name="lab_test" />
      <FormError error={error} />
    </form>
  );
}

function AddLabResultForm({
  orderId,
  itemId,
  labTest,
  onUpdated,
}: {
  orderId: string;
  itemId: string;
  labTest: string;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("lab_orders.result", isOnline());
      return api(`/lab-orders/${orderId}/items/${itemId}/results/`, {
        method: "POST",
        body: JSON.stringify({ value: value.trim() }),
      });
    },
    onSuccess: async () => {
      setValue("");
      setError(null);
      toast.success("Result recorded.");
      await queryClient.invalidateQueries({ queryKey: ["lab-results"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(labResultSchema, { value }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-3" onSubmit={onSubmit}>
      <p className="text-sm font-medium md:col-span-3">
        Enter result for <LabTestLabel id={labTest} />
      </p>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`result_${itemId}`}>Value</Label>
        <Input id={`result_${itemId}`} value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save result"}
        </Button>
      </div>
      <div className="md:col-span-3">
        <FormFieldError error={error} name="value" />
        <FormError error={error} />
      </div>
    </form>
  );
}
