import { allowed } from "@/features/access/navigation";

export type QuickAction = {
  label: string;
  description: string;
  href: string;
  permission: string;
};

export const quickActions: QuickAction[] = [
  {
    label: "Register patient",
    description: "Add a new patient record.",
    href: "/patients",
    permission: "patients.create",
  },
  {
    label: "Walk-in desk",
    description: "Check in a patient without an appointment.",
    href: "/walk-in",
    permission: "appointments.create",
  },
  {
    label: "Book appointment",
    description: "Schedule a visit.",
    href: "/appointments",
    permission: "appointments.create",
  },
  {
    label: "Queue board",
    description: "Manage today's queue.",
    href: "/queue",
    permission: "appointments.view",
  },
  {
    label: "Consultations",
    description: "Open encounter charts.",
    href: "/consultation",
    permission: "encounters.view",
  },
  {
    label: "Pharmacy",
    description: "Review medicines and stock.",
    href: "/pharmacy",
    permission: "pharmacy.view",
  },
  {
    label: "Laboratory",
    description: "Process lab orders.",
    href: "/laboratory",
    permission: "laboratory.view",
  },
  {
    label: "Billing",
    description: "Review invoices.",
    href: "/billing",
    permission: "billing.view",
  },
  {
    label: "Reports",
    description: "Daily operational summary.",
    href: "/reports",
    permission: "reports.view",
  },
  {
    label: "Users",
    description: "Manage clinic staff accounts.",
    href: "/users",
    permission: "users.manage",
  },
  {
    label: "Roles",
    description: "Assign permissions to staff.",
    href: "/roles",
    permission: "roles.manage",
  },
];

export function quickActionsFor(permissions: string[]) {
  return quickActions.filter((action) => allowed(permissions, action.permission));
}
