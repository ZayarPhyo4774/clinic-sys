"use client";

import { ArrowLeft, LogOut, Menu, Shield } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { OPERATOR_SECTIONS, operatorSectionMeta } from "@/features/operator/constants";
import { useOperatorSection } from "@/features/operator/operator-section-context";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "OP";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function SectionNav({ onNavigate }: { onNavigate?: () => void }) {
  const { section: active, navigate } = useOperatorSection();

  return (
    <nav aria-label="Operator sections" className="flex flex-1 flex-col gap-1">
      {OPERATOR_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = active === section.id;
        return (
          <button
            key={section.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              navigate(section.id);
              onNavigate?.();
            }}
            className={cn(
              "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "nav-active-indicator bg-primary/10 text-primary shadow-premium-sm"
                : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="truncate">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function OperatorShell({ children }: { children: React.ReactNode }) {
  const { account, isLoading, signOut } = useAuth();
  const { section } = useOperatorSection();
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = operatorSectionMeta(section);
  const name = account?.full_name || account?.email || "Operator";

  if (isLoading) {
    return (
      <div className="gradient-mesh flex h-dvh items-center justify-center p-6">
        <QueryState status="loading" />
      </div>
    );
  }

  if (!account?.is_superuser) {
    return (
      <div className="gradient-mesh flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4">
          <QueryState
            status="forbidden"
            title="Operator console"
            detail="Only platform operators can open this workspace."
          />
          <Button asChild variant="outline" className="w-full">
            <Link href="/">
              <ArrowLeft />
              Back to clinic workspace
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="gradient-mesh flex h-dvh overflow-hidden">
      <aside className="glass-panel hidden h-dvh w-64 shrink-0 flex-col overflow-hidden shadow-premium-md md:flex">
        <div className="shrink-0 px-4 py-5">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" className="bg-foreground/90 text-background" />
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight">ClinicSys</p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Shield className="size-3" />
                Operator console
              </p>
            </div>
          </div>
        </div>
        <Separator className="shrink-0 opacity-60" />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <SectionNav />
        </div>
        <Separator className="shrink-0 opacity-60" />
        <div className="shrink-0 space-y-2 p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <Avatar className="size-9 ring-2 ring-primary/10">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">Platform operator</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/">
              <ArrowLeft />
              Clinic workspace
            </Link>
          </Button>
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle compact />
            <Button type="button" variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-panel z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 shadow-premium-sm md:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open menu" className="md:hidden">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined} className="glass-panel w-80">
              <div className="flex items-center gap-3">
                <BrandLogo size="sm" />
                <SheetTitle className="text-base font-bold">Operator</SheetTitle>
              </div>
              <div className="mt-6 flex flex-1 flex-col">
                <SectionNav onNavigate={() => setMenuOpen(false)} />
              </div>
              <Separator className="my-4" />
              <Button asChild variant="outline" className="w-full">
                <Link href="/">
                  <ArrowLeft />
                  Clinic workspace
                </Link>
              </Button>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1 md:hidden">
            <p className="text-sm font-semibold">Operator</p>
            <p className="text-xs text-muted-foreground">{meta.label}</p>
          </div>
          <div className="hidden md:flex md:flex-1 md:justify-end md:gap-2">
            <ThemeToggle compact />
            <Button type="button" variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </header>

        <main className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto p-4 md:p-8">
          <PageHeader eyebrow="Platform provisioning" title={meta.label} description={meta.description} />
          <div className="mt-8">{children}</div>
        </main>

        <footer className="glass-panel z-20 shrink-0 border-t px-4 py-3 text-xs text-muted-foreground md:px-8">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground/70">ClinicSys Operator</span>
            <span>Provisioning and governance</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
