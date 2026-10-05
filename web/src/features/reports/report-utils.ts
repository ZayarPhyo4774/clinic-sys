import { apiDownload, withQuery } from "@/lib/api/client";
import { addDaysIso, clinicTimeZone, localDateIso } from "@/lib/dates/clinic-date";

export type DatePreset = "today" | "7d" | "30d" | "custom";

export type ReportRange = {
  preset: DatePreset;
  from: string;
  to: string;
};

export function todayIso(timeZone?: string | null): string {
  return localDateIso(clinicTimeZone(timeZone));
}

export function offsetIso(days: number, timeZone?: string | null): string {
  const zone = clinicTimeZone(timeZone);
  return addDaysIso(localDateIso(zone), days, zone);
}

export function rangeFromPreset(preset: DatePreset, timeZone?: string | null): { from: string; to: string } {
  const zone = clinicTimeZone(timeZone);
  const to = localDateIso(zone);
  if (preset === "today") {
    return { from: to, to };
  }
  if (preset === "7d") {
    return { from: addDaysIso(to, -6, zone), to };
  }
  if (preset === "30d") {
    return { from: addDaysIso(to, -29, zone), to };
  }
  return { from: to, to };
}

export function formatRangeLabel(from: string, to: string): string {
  if (from === to) {
    return from;
  }
  return `${from} – ${to}`;
}

export function rangeQueryParams(range: ReportRange): Record<string, string | undefined> {
  if (range.from === range.to) {
    return { date: range.from };
  }
  return { from: range.from, to: range.to };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadReportCsv(report: string, params: Record<string, string | undefined>) {
  const { blob, filename } = await apiDownload(
    withQuery("/reports/export/", { report, ...params }),
    "text/csv",
  );
  triggerDownload(blob, filename ?? `${report}-report.csv`);
}

export async function downloadCcrExport(format: "xlsx" | "pdf", params: Record<string, string | undefined>) {
  const { blob, filename } = await apiDownload(
    withQuery("/reports/ccr/export/", { export_format: format, ...params }),
    "*/*",
  );
  triggerDownload(blob, filename ?? `ccr-report.${format === "pdf" ? "pdf" : "xlsx"}`);
}
