const stockKindLabels: Record<string, string> = {
  stock_in: "Stock in",
  adjustment: "Adjustment",
  dispense: "Dispense",
};

const stockReasonLabels: Record<string, string> = {
  damaged: "Damaged",
  expired: "Expired",
  count_correction: "Count correction",
  other: "Other",
};

export function formatStockKind(value: string) {
  return stockKindLabels[value] ?? value.replace(/_/g, " ");
}

export function formatStockReason(value: string) {
  if (!value) {
    return "—";
  }
  return stockReasonLabels[value] ?? value.replace(/_/g, " ");
}

export function formatStockDirection(value: string) {
  if (!value) {
    return "—";
  }
  return value === "in" ? "In" : value === "out" ? "Out" : value;
}
