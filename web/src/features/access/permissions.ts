import { allowed } from "@/features/access/navigation";

export function hasAllPermissions(permissions: string[], codes: string[]) {
  return codes.every((code) => allowed(permissions, code));
}

export function canUseWalkIn(permissions: string[]) {
  return hasAllPermissions(permissions, ["appointments.create", "appointments.update"]);
}
