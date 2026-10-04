"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PrintToolbar({
  backHref,
  backLabel,
  title,
  autoPrint = false,
  ready = true,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  autoPrint?: boolean;
  ready?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint || !ready) {
      return;
    }
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [autoPrint, ready]);

  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div>
        <p className="text-sm text-muted-foreground">Print preview</p>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
        <Button type="button" size="sm" disabled={!ready} onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" />
          Print
        </Button>
      </div>
    </div>
  );
}

export function PrintDocument({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "print-document mx-auto w-full min-w-0 max-w-[210mm] bg-white p-8 text-black shadow-premium-sm dark:bg-white dark:text-black",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function PrintHeader({
  clinicName,
  documentTitle,
  documentRef,
}: {
  clinicName: string;
  documentTitle: string;
  documentRef?: string;
}) {
  return (
    <header className="border-b-2 border-black pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">{clinicName}</p>
          <h1 className="mt-1 text-2xl font-bold">{documentTitle}</h1>
        </div>
        {documentRef ? <p className="text-right text-xs text-neutral-600">Ref: {documentRef}</p> : null}
      </div>
    </header>
  );
}

export function PrintSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function PrintMetaGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-neutral-600">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PrintTable({
  headers,
  rows,
  compact = false,
}: {
  headers: string[];
  rows: string[][];
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-600">None recorded.</p>;
  }

  return (
    <div className="max-w-full overflow-x-auto">
      <table
        className={cn(
          "w-full min-w-0 border-collapse",
          compact ? "table-fixed text-xs" : "text-sm",
        )}
      >
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="border border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-semibold break-words"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${index}-${cellIndex}`}
                  className="border border-neutral-300 px-2 py-1 align-top break-words [overflow-wrap:anywhere]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrintSignatureBlock({ doctorName }: { doctorName: string }) {
  return (
    <footer className="mt-10 break-inside-avoid border-t border-neutral-300 pt-6">
      <div className="flex justify-between gap-8 text-sm">
        <div>
          <p className="text-neutral-600">Attending physician</p>
          <p className="mt-8 border-t border-neutral-400 pt-1 font-semibold">{doctorName || "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-neutral-600">Date</p>
          <p className="mt-8 border-t border-neutral-400 pt-1">{new Date().toLocaleDateString()}</p>
        </div>
      </div>
      <p className="mt-6 text-center text-[10px] text-neutral-500">
        Computer-generated clinical record · {new Date().toLocaleString()}
      </p>
    </footer>
  );
}
