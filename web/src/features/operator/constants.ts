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
    description: "Platform status and guided clinic setup.",
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
    label: "Feature catalog & roles",
    description: "Global permission catalog and per-clinic default role templates.",
    icon: KeyRound,
  },
  {
    id: "roles",
    label: "Custom roles",
    description: "Clinic-specific permission bundles beyond the default templates.",
    icon: Shield,
  },
  {
    id: "staff",
    label: "Clinic logins",
    description: "User accounts for clinic staff (not platform operators).",
    icon: Users,
  },
  {
    id: "assignments",
    label: "Role assignments",
    description: "Grant permissions by linking logins to roles (optionally per branch).",
    icon: UserCog,
  },
];

export function operatorSectionMeta(id: OperatorSectionId) {
  return OPERATOR_SECTIONS.find((section) => section.id === id) ?? OPERATOR_SECTIONS[0];
}
