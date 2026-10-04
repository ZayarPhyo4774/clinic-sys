import {
  Activity,
  Bell,
  Building2,
  Calendar,
  ConciergeBell,
  ClipboardList,
  CreditCard,
  FlaskConical,
  LayoutDashboard,
  Pill,
  Settings,
  Shield,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";

export const navIcons: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/notifications": Bell,
  "/patients": Users,
  "/consultation": Stethoscope,
  "/prescriptions": ClipboardList,
  "/laboratory": FlaskConical,
  "/appointments": Calendar,
  "/walk-in": ConciergeBell,
  "/queue": Activity,
  "/pharmacy": Pill,
  "/billing": CreditCard,
  "/reports": ClipboardList,
  "/branches": Building2,
  "/departments": Building2,
  "/staff": Users,
  "/schedules": Calendar,
  "/users": Shield,
  "/roles": Shield,
  "/audit-logs": Shield,
  "/settings": Settings,
};

export function iconForNav(href: string): LucideIcon {
  return navIcons[href] ?? LayoutDashboard;
}
