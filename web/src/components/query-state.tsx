"use client";

import { AlertCircle, Building2, Inbox, Loader2, ShieldAlert } from "lucide-react";

import { formatMutationError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type QueryStateProps = {
  status: "loading" | "error" | "empty" | "forbidden" | "unavailable" | "branch_required";
  title?: string;
  detail?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
};

const stateConfig = {
  forbidden: { icon: ShieldAlert, tone: "border-destructive/20 bg-destructive/5" },
  unavailable: { icon: AlertCircle, tone: "border-border bg-card" },
  branch_required: { icon: Building2, tone: "border-warning/30 bg-warning/5" },
  empty: { icon: Inbox, tone: "border-dashed border-border/80 bg-muted/30" },
  error: { icon: AlertCircle, tone: "border-destructive/30 bg-destructive/5" },
} as const;

export function QueryState({ status, title, detail, onRetry, action }: QueryStateProps) {
  if (status === "loading") {
    return (
      <div className="space-y-4 py-8" aria-busy="true" aria-label="Loading">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm font-medium">Loading…</span>
        </div>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-3/4 max-w-sm" />
      </div>
    );
  }

  if (status === "forbidden") {
    const { icon: Icon, tone } = stateConfig.forbidden;
    return (
      <div className={cn("rounded-xl border p-8 shadow-premium-sm", tone)} role="alert">
        <Icon className="size-8 text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">{title || "Access denied"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail || "You do not have permission to open this page."}
        </p>
      </div>
    );
  }

  if (status === "unavailable") {
    const { icon: Icon, tone } = stateConfig.unavailable;
    return (
      <div className={cn("rounded-xl border p-8 shadow-premium-sm", tone)}>
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail || "This resource is not available."}
        </p>
      </div>
    );
  }

  if (status === "branch_required") {
    const { icon: Icon, tone } = stateConfig.branch_required;
    return (
      <div className={cn("rounded-xl border p-8 shadow-premium-sm", tone)} role="alert">
        <Icon className="size-8 text-warning-foreground" aria-hidden="true" />
        <h2 className="mt-4 text-base font-semibold">{title || "Branch required"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail || "Select a branch in Settings to load records for your role."}
        </p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    );
  }

  if (status === "empty") {
    const { icon: Icon, tone } = stateConfig.empty;
    return (
      <div className={cn("rounded-xl border px-6 py-12 text-center shadow-premium-sm", tone)}>
        <Icon className="mx-auto size-10 text-muted-foreground/60" aria-hidden="true" />
        {title ? <h2 className="mt-4 text-base font-semibold">{title}</h2> : null}
        <p className={cn("text-sm text-muted-foreground", title ? "mt-2" : "mt-4")}>
          {detail || "No records are available."}
        </p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    );
  }

  const { icon: Icon, tone } = stateConfig.error;
  return (
    <div className={cn("rounded-xl border p-8 shadow-premium-sm", tone)} role="alert">
      <Icon className="size-8 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-base font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail || "The request could not be completed."}</p>
      {onRetry ? (
        <Button className="mt-5" variant="outline" type="button" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function describeError(error: unknown) {
  return formatMutationError(error);
}
