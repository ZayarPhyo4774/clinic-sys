import { api } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

export async function fetchAllPages<T>(path: string, pageSize = 500): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  let nextPath: string | null = `${path}${separator}page_size=${pageSize}`;
  const rows: T[] = [];

  while (nextPath) {
    const page = await api<Page<T>>(nextPath);
    rows.push(...page.results);
    if (!page.next) {
      break;
    }
    const nextUrl = new URL(page.next, "http://local");
    nextPath = `${nextUrl.pathname.replace("/api/v1", "")}${nextUrl.search}`;
  }

  return rows;
}
