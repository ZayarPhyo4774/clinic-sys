function numeric(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function sameClinicalValue(left: unknown, right: unknown) {
  const leftEmpty = left == null || left === "";
  const rightEmpty = right == null || right === "";
  if (leftEmpty || rightEmpty) {
    return leftEmpty && rightEmpty;
  }
  const leftNumber = numeric(left);
  const rightNumber = numeric(right);
  if (leftNumber != null && rightNumber != null) {
    return Math.abs(leftNumber - rightNumber) < 0.0001;
  }
  return String(left).trim() === String(right).trim();
}

export function clinicalFieldsDiffer(
  sent: Record<string, unknown>,
  received: Record<string, unknown>,
  keys: string[],
) {
  return keys.some((key) => !sameClinicalValue(sent[key], received[key]));
}

export function recordId(value: unknown) {
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return null;
}
