"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type Breadcrumb = {
  label: string;
  href?: string;
};

export function DetailLayout({
  breadcrumbs,
  title,
  description,
  actions,
  children,
}: {
  breadcrumbs: Breadcrumb[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden="true" /> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="transition-colors hover:text-primary">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
