"use client";

import { PharmacyReportPanel } from "@/features/reports/pharmacy-report-panel";
import { rangeFromPreset, type ReportRange } from "@/features/reports/report-utils";
import { clinicTimeZone } from "@/lib/dates/clinic-date";
import { useAuth } from "@/features/auth/auth-provider";

export function PharmacyInventoryReportPanel() {
  const { account } = useAuth();
  const bounds = rangeFromPreset("30d", clinicTimeZone(account?.clinic_timezone));
  const range: ReportRange = { preset: "30d", ...bounds };
  return <PharmacyReportPanel range={range} />;
}
