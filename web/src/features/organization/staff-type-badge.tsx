import { Badge } from "@/components/ui/badge";
import { staffTypeOptions } from "@/features/organization/contract";

const labels = Object.fromEntries(staffTypeOptions.map((option) => [option.value, option.label]));

export function StaffTypeBadge({ value }: { value: string }) {
  const label = labels[value] ?? value;
  const variant = value === "doctor" ? "info" : value === "nurse" ? "success" : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}
