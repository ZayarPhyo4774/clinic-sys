import { getAccessToken, getStoredBranchId } from "@/lib/auth/storage";

export type DatePreset = "today" | "7d" | "30d" | "custom";

export type ReportRange = {
  preset: DatePreset;
  from: string;
  to: string;
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function offsetIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function rangeFromPreset(preset: DatePreset): { from: string; to: string } {
  const to = todayIso();
  if (preset === "today") {
    return { from: to, to };
  }
  if (preset === "7d") {
    return { from: offsetIso(-6), to };
  }
  if (preset === "30d") {
    return { from: offsetIso(-29), to };
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

export async function downloadReportCsv(report: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams({ report });
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const headers = new Headers({ Accept: "text/csv" });
  const access = getAccessToken();
  if (access) {
    headers.set("Authorization", `Bearer ${access}`);
  }
  const branchId = getStoredBranchId();
  if (branchId) {
    headers.set("X-Branch-Id", branchId);
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1/reports/export/?${search.toString()}`, { headers });
  } catch {
    throw new Error("The clinic API could not be reached.");
  }
  if (!response.ok) {
    let detail = "Export failed.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // CSV or empty error bodies are ignored.
    }
    throw new Error(detail);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report}-report.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
