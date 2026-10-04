export type NavItem = {
  href: string;
  label: string;
  permission: string | null;
  module: "Workspace" | "Clinical" | "Operations" | "Administration";
  submodule: string;
  /** Planned screens stay routable but are hidden from the sidebar until implemented. */
  status?: "ready" | "planned";
};

export const navigation: NavItem[] = [
  { href: "/", label: "Dashboard", permission: null, module: "Workspace", submodule: "Overview" },
  {
    href: "/notifications",
    label: "Notifications",
    permission: "notifications.view",
    module: "Workspace",
    submodule: "Inbox",
  },
  { href: "/patients", label: "Patients", permission: "patients.view", module: "Clinical", submodule: "Records" },
  {
    href: "/consultation",
    label: "Consultation",
    permission: "encounters.view",
    module: "Clinical",
    submodule: "Encounters",
  },
  {
    href: "/prescriptions",
    label: "Prescriptions",
    permission: "prescriptions.view",
    module: "Clinical",
    submodule: "Orders",
  },
  { href: "/laboratory", label: "Laboratory", permission: "laboratory.view", module: "Clinical", submodule: "Tests" },
  {
    href: "/appointments",
    label: "Appointments",
    permission: "appointments.view",
    module: "Operations",
    submodule: "Scheduling",
  },
  {
    href: "/walk-in",
    label: "Walk-in",
    permission: "appointments.create",
    module: "Operations",
    submodule: "Flow",
  },
  { href: "/queue", label: "Queue", permission: "appointments.view", module: "Operations", submodule: "Flow" },
  { href: "/pharmacy", label: "Pharmacy", permission: "pharmacy.view", module: "Operations", submodule: "Dispensing" },
  { href: "/billing", label: "Billing", permission: "billing.view", module: "Operations", submodule: "Revenue" },
  { href: "/reports", label: "Reports", permission: "reports.view", module: "Operations", submodule: "Insights" },
  { href: "/branches", label: "Branches", permission: "branches.view", module: "Administration", submodule: "Network" },
  {
    href: "/departments",
    label: "Departments",
    permission: "departments.view",
    module: "Administration",
    submodule: "Organization",
  },
  { href: "/staff", label: "Staff", permission: "staff.view", module: "Administration", submodule: "Workforce" },
  {
    href: "/schedules",
    label: "Schedules",
    permission: "appointments.view",
    module: "Administration",
    submodule: "Staffing",
  },
  { href: "/users", label: "Users", permission: "users.manage", module: "Administration", submodule: "Access" },
  { href: "/roles", label: "Roles", permission: "roles.manage", module: "Administration", submodule: "Access" },
  { href: "/audit-logs", label: "Audit Logs", permission: "audit.view", module: "Administration", submodule: "Compliance" },
  { href: "/settings", label: "Settings", permission: null, module: "Administration", submodule: "System" },
];

export function allowed(permissions: string[], permission: string | null) {
  return permission === null || permissions.includes(permission);
}

export const OPERATOR_HREF = "/operator";

export function navigationFor(permissions: string[]) {
  return navigation
    .filter((item) => item.status !== "planned")
    .filter((item) => allowed(permissions, item.permission));
}

export type NavModuleGroup = {
  module: NavItem["module"];
  items: NavItem[];
};

export function navigationGroupsFor(permissions: string[]): NavModuleGroup[] {
  const order: NavItem["module"][] = ["Workspace", "Clinical", "Operations", "Administration"];
  const allowedItems = navigationFor(permissions);
  return order
    .map((module) => ({
      module,
      items: allowedItems.filter((item) => item.module === module),
    }))
    .filter((group) => group.items.length > 0);
}

export function canAccessOperator(isSuperuser: boolean) {
  return isSuperuser;
}

export function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return "/";
  }
  return value;
}

export function postSignInPath(account: { is_superuser: boolean }, next: string | null) {
  const path = safeNextPath(next);
  if (account.is_superuser && path === "/") {
    return OPERATOR_HREF;
  }
  return path;
}
