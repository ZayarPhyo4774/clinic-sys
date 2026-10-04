import type { InvoiceItem } from "@/lib/api/types";

export function formatMoney(
  currency: string,
  amount: string | number | null | undefined,
  locale?: string,
) {
  const value = Number(amount ?? 0);
  const code = (currency || "USD").trim().toUpperCase();
  if (!Number.isFinite(value)) {
    return `${code} —`;
  }
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString(locale || undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function formatInvoiceKind(kind: string) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function invoiceLineTotal(item: Pick<InvoiceItem, "quantity" | "unit_price" | "discount_amount" | "line_total">) {
  if (item.line_total) {
    return Number(item.line_total);
  }
  const gross = Number(item.quantity) * Number(item.unit_price);
  return gross - Number(item.discount_amount || 0);
}
