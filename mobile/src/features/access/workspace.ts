export type Workspace = "doctor" | "nurse" | "patient";

export type Destination = {
  href: string;
  label: string;
  permission: string | null;
};

export const doctorDestinations: Destination[] = [
  { href: "/doctor/appointments", label: "Today's appointments", permission: "appointments.view" },
  { href: "/doctor/queue", label: "Queue", permission: "appointments.view" },
  { href: "/doctor/patients", label: "Patient", permission: "patients.view" },
  { href: "/doctor/consultation", label: "Consultation", permission: "encounters.view" },
  { href: "/doctor/prescriptions", label: "Prescription", permission: "prescriptions.view" },
  { href: "/doctor/pharmacy", label: "Pharmacy", permission: "pharmacy.view" },
  { href: "/doctor/laboratory", label: "Laboratory", permission: "laboratory.view" },
  { href: "/doctor/billing", label: "Billing", permission: "billing.view" },
  { href: "/doctor/notifications", label: "Notifications", permission: "notifications.view" },
];

export const nurseDestinations: Destination[] = [
  { href: "/nurse/queue", label: "Queue", permission: "appointments.view" },
  { href: "/nurse/patients", label: "Patient", permission: "patients.view" },
  { href: "/nurse/vitals", label: "Vital signs", permission: null },
];

export const patientDestinations: Destination[] = [
  { href: "/patient/appointments", label: "Appointments", permission: "appointments.view" },
  { href: "/patient/book", label: "Book appointment", permission: "appointments.create" },
  { href: "/patient/queue", label: "Queue", permission: "appointments.view" },
  { href: "/patient/prescriptions", label: "Prescriptions", permission: "prescriptions.view" },
  { href: "/patient/laboratory", label: "Laboratory results", permission: "laboratory.view" },
  { href: "/patient/billing", label: "Billing", permission: "billing.view" },
  { href: "/patient/notifications", label: "Notifications", permission: "notifications.view" },
  { href: "/patient/profile", label: "Profile", permission: null },
];

export function destinationsFor(workspace: Workspace) {
  if (workspace === "doctor") {
    return doctorDestinations;
  }
  if (workspace === "nurse") {
    return nurseDestinations;
  }
  return patientDestinations;
}

export function workspaceHome(workspace: Workspace) {
  if (workspace === "doctor") {
    return "/doctor";
  }
  if (workspace === "nurse") {
    return "/nurse";
  }
  return "/patient";
}

export function allowed(permissions: string[], permission: string | null) {
  return permission === null || permissions.includes(permission);
}

export function workspaceFromStaffType(staffType: string | null): Workspace | null {
  if (staffType === "doctor" || staffType === "nurse") {
    return staffType;
  }
  return null;
}

export function workspaceFromPermissions(permissions: string[]): Workspace {
  if (
    permissions.includes("prescriptions.view") ||
    permissions.includes("prescriptions.create") ||
    permissions.includes("pharmacy.view") ||
    permissions.includes("pharmacy.manage") ||
    permissions.includes("billing.view")
  ) {
    return "doctor";
  }
  if (permissions.includes("encounters.view") || permissions.includes("encounters.create")) {
    return "nurse";
  }
  return "patient";
}
