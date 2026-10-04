import {
  Building2,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Shield,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type OperatorSectionId =
  | "overview"
  | "clinics"
  | "branches"
  | "access"
  | "roles"
  | "staff"
  | "assignments";

export type OperatorSection = {
  id: OperatorSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const OPERATOR_SECTIONS: OperatorSection[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Platform status and solo-clinic setup progress.",
    icon: LayoutDashboard,
  },
  {
    id: "clinics",
    label: "Clinics",
    description: "Organizations and tenancy boundaries.",
    icon: Building2,
  },
  {
    id: "branches",
    label: "Branches",
    description: "Physical sites within each clinic.",
    icon: GitBranch,
  },
  {
    id: "access",
    label: "Module access",
    description: "Permission catalog and default roles.",
    icon: KeyRound,
  },
  {
    id: "roles",
    label: "Roles",
    description: "Permission bundles assigned to staff.",
    icon: Shield,
  },
  {
    id: "staff",
    label: "Staff logins",
    description: "Clinic user accounts (not operators).",
    icon: Users,
  },
  {
    id: "assignments",
    label: "Assignments",
    description: "Connect users to roles and branches.",
    icon: UserCog,
  },
];

export function operatorSectionMeta(id: OperatorSectionId) {
  return OPERATOR_SECTIONS.find((section) => section.id === id) ?? OPERATOR_SECTIONS[0];
}
