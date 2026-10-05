"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { QueryState, describeError } from "@/components/query-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, isBranchAuthorizationError } from "@/lib/api/errors";
import { withQuery } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";
import { loadCachedPage } from "@/offline/repositories/read-repository";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
};

function statusVariant(value: string): "success" | "warning" | "destructive" | "info" | "default" {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (["active", "completed", "paid", "confirmed", "dispensed", "approved", "done"].includes(normalized)) {
    return "success";
  }
  if (
    ["pending", "scheduled", "issued", "partially_dispensed", "partially_paid", "in_progress", "waiting"].includes(
      normalized,
    )
  ) {
    return "warning";
  }
  if (["cancelled", "canceled", "inactive", "failed", "rejected", "expired"].includes(normalized)) {
    return "destructive";
  }
  if (["draft", "open", "new"].includes(normalized)) {
    return "info";
  }
  return "default";
}

export function StatusText({ value }: { value: string }) {
  const variant = statusVariant(value);
  const label = value.replace(/_/g, " ");
  return <Badge variant={variant}>{label}</Badge>;
}

export function RecordBrowser<T extends { id: string }>({
  title,
  description,
  resource,
  path,
  columns,
  emptyLabel,
  toolbar,
  rowHref,
  rowLabel,
  emptyAction,
  listParams,
  refetchInterval,
}: {
  title: string;
  description?: string;
  resource: string;
  path: string;
  columns: Column<T>[];
  emptyLabel: string;
  toolbar?: React.ReactNode;
  rowHref?: (row: T) => string;
  rowLabel?: (row: T) => string;
  emptyAction?: React.ReactNode;
  listParams?: Record<string, string | undefined>;
  refetchInterval?: number;
}) {
  const router = useRouter();
  const { branchId, account } = useAuth();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const requestPath = withQuery(path, {
    ...listParams,
    search: search || undefined,
    page: page > 1 ? String(page) : undefined,
  });

  const query = useQuery({
    queryKey: [resource, { search, page, branchId, listParams }],
    queryFn: () => loadCachedPage<T>({ path: requestPath, userId: account?.id ?? null, branchId }),
    refetchInterval,
  });

  const pageData: Page<T> | undefined = query.data?.page;
  const pageCount = pageData ? Math.max(1, Math.ceil(pageData.count / 20)) : 1;
  const resolvedEmptyAction =
    emptyAction ??
    (toolbar ? (
      <p className="text-sm text-muted-foreground">Use the form above to add the first {emptyLabel}.</p>
    ) : null);

  return (
    <section className="space-y-6">
      <div className="border-b pb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {toolbar}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(draft.trim());
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor={`${resource}-search`}>Search</Label>
          <Input
            id={`${resource}-search`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {query.data?.fromCache ? (
        <p className="text-sm text-muted-foreground">Showing a saved copy from this browser.</p>
      ) : null}
      {query.isLoading ? <TableSkeleton columns={columns.length} /> : null}
      {query.isError ? (
        query.error instanceof ApiError && query.error.status === 404 ? (
          <p className="text-sm text-muted-foreground">This resource is not available.</p>
        ) : query.error instanceof ApiError && isBranchAuthorizationError(query.error) && !branchId ? (
          <QueryState
            status="branch_required"
            detail="This list needs a branch context. Choose one in Settings or the sidebar."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Open Settings</Link>
              </Button>
            }
          />
        ) : (
          <QueryState status="error" detail={describeError(query.error)} onRetry={() => void query.refetch()} />
        )
      ) : null}
      {pageData && pageData.results.length === 0 ? (
        <QueryState
          status="empty"
          title={search ? undefined : `No ${emptyLabel} yet`}
          detail={search ? `No ${emptyLabel} match this search.` : `No ${emptyLabel} are recorded.`}
          action={search ? undefined : resolvedEmptyAction}
        />
      ) : null}
      {pageData && pageData.results.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-premium-sm">
          <Table>
            <TableCaption>{title}</TableCaption>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.results.map((row) => {
                const href = rowHref?.(row);
                const label = href ? rowLabel?.(row) : undefined;
                return (
                  <TableRow
                    key={row.id}
                    tabIndex={href ? 0 : undefined}
                    aria-label={label}
                    className={href ? "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : undefined}
                    onClick={
                      href
                        ? () => {
                            router.push(href);
                          }
                        : undefined
                    }
                    onKeyDown={
                      href
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(href);
                            }
                          }
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key}>{column.cell(row)}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-3 border-t px-3 py-3">
            <p className="text-sm text-muted-foreground">{pageData.count} records</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pageData.previous}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pageData.next}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
