"use client";

import {
  Calendar,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Pill,
  Shield,
  Stethoscope,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { quickActionsFor, type QuickAction } from "@/features/access/quick-actions";
import { useAuth } from "@/features/auth/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const actionIcons: Record<string, LucideIcon> = {
  "Register patient": UserPlus,
  "Book appointment": Calendar,
  "Queue board": ClipboardList,
  Consultations: Stethoscope,
  Pharmacy: Pill,
  Laboratory: FlaskConical,
  Billing: CreditCard,
  Reports: ClipboardList,
  Users: Shield,
  Roles: Shield,
};

export function QuickActionsPanel() {
  const { account } = useAuth();
  const actions = quickActionsFor(account?.permissions ?? []);

  if (actions.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Quick actions</h2>
        <p className="text-sm text-muted-foreground">Common tasks based on your permissions.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <QuickActionCard key={action.href + action.label} action={action} />
        ))}
      </div>
    </section>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = actionIcons[action.label] ?? ClipboardList;

  return (
    <Link
      href={action.href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/20 group-hover:shadow-premium-md">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">{action.label}</CardTitle>
              <CardDescription className="mt-1">{action.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className={cn("text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5")}>
            Open →
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
