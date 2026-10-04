"use client";

import { Activity, Building2, Layers, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BranchIndicator } from "@/components/branch-indicator";
import { BranchReminder } from "@/components/branch-reminder";
import { SyncStatus } from "@/components/sync-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { canAccessOperator, navigationGroupsFor, OPERATOR_HREF, type NavItem } from "@/features/access/navigation";
import { iconForNav } from "@/features/access/nav-icons";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "CS";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function NavLinks({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const { account } = useAuth();
  const permissions = account?.permissions ?? [];
  const groups = navigationGroupsFor(permissions);

  const moduleIcon: Record<NavItem["module"], ComponentType<{ className?: string }>> = {
    Workspace: Layers,
    Clinical: Activity,
    Operations: Building2,
    Administration: Shield,
  };

  return (
    <nav aria-label="Clinic" className="flex flex-1 flex-col gap-5">
      {groups.map((group) => {
        const ModuleIcon = moduleIcon[group.module];
        return (
          <section key={group.module} className="space-y-1">
            {collapsed ? (
              <div className="flex justify-center py-1">
                <span className="rounded-lg p-2 text-muted-foreground" title={group.module}>
                  <ModuleIcon className="size-4" />
                </span>
              </div>
            ) : (
              <p className="flex items-center gap-2 px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
                <ModuleIcon className="size-3" />
                {group.module}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const ItemIcon = iconForNav(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      collapsed && "justify-center px-2",
                      active
                        ? "nav-active-indicator bg-primary/10 text-primary shadow-premium-sm"
                        : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <ItemIcon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    {collapsed ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate">{item.label}</span>
                        <span className={cn("truncate text-[10px] text-muted-foreground", active && "text-primary/70")}>
                          {item.submodule}
                        </span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { account, signOut } = useAuth();
  const name = account?.full_name || account?.email || "Account";
  const showOperator = canAccessOperator(Boolean(account?.is_superuser));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-9 ring-2 ring-primary/10">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
          </Avatar>
          <span className={cn("min-w-0 flex-1", compact && "hidden")}>
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{account?.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {showOperator ? (
          <DropdownMenuItem asChild>
            <Link href={OPERATOR_HREF}>
              <Shield />
              Operator console
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoading, account } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="gradient-mesh flex h-dvh overflow-hidden">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:shadow-premium-md"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          "glass-panel hidden h-dvh shrink-0 flex-col overflow-hidden shadow-premium-md transition-all duration-300 md:flex",
          collapsed ? "w-20" : "w-72",
        )}
      >
        <div className={cn("shrink-0 px-4 py-5", collapsed && "px-3")}>
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <BrandLogo size={collapsed ? "sm" : "md"} />
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-foreground">ClinicSys</p>
                <p className="text-[11px] text-muted-foreground">Premium care workspace</p>
              </div>
            ) : null}
          </div>
          <div className={cn("mt-4 space-y-3", collapsed && "mt-3 space-y-2")}>
            <BranchIndicator />
            <SyncStatus />
          </div>
        </div>
        <Separator className="shrink-0 opacity-60" />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          {isLoading || !account ? (
            <p className="px-3 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <NavLinks collapsed={collapsed} />
          )}
        </div>
        <Separator className="shrink-0 opacity-60" />
        <div className={cn("shrink-0 space-y-2 p-3", collapsed && "px-2")}>
          <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
            <ThemeToggle compact={collapsed} />
          </div>
          <AccountMenu compact={collapsed} />
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-panel z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 shadow-premium-sm md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open menu" className="md:hidden">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined} className="glass-panel w-80">
              <div className="flex items-center gap-3">
                <BrandLogo size="sm" />
                <SheetTitle className="text-base font-bold">ClinicSys</SheetTitle>
              </div>
              <div className="mt-6 flex flex-1 flex-col">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <Separator className="my-4" />
              <div className="flex items-center justify-between">
                <ThemeToggle />
                <AccountMenu />
              </div>
            </SheetContent>
          </Sheet>
          <Button
            variant="outline"
            size="icon"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="hidden md:inline-flex"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">ClinicSys</p>
            <p className="text-xs text-muted-foreground">Workspace</p>
          </div>
          <div className="hidden shrink-0 md:block">
            <SyncStatus />
          </div>
          <ThemeToggle compact />
          <div className="hidden md:block">
            <AccountMenu />
          </div>
        </header>
        <main id="content" className="mx-auto min-h-0 w-full max-w-7xl flex-1 space-y-6 overflow-y-auto p-4 md:p-8">
          <BranchReminder />
          {children}
        </main>
        <footer className="glass-panel z-20 shrink-0 border-t px-4 py-4 text-xs text-muted-foreground md:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground/70">ClinicSys Premium</span>
            <span>Secure workflow · Better patient care</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
