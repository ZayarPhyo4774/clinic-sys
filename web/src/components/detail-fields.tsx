import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-premium-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>;
}

export function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function DetailTable({
  columns,
  rows,
  emptyLabel,
}: {
  columns: { key: string; header: string; cell: (row: Record<string, unknown>) => React.ReactNode }[];
  rows: Record<string, unknown>[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border shadow-premium-sm">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key}>{column.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={String(row.id ?? index)}>
              {columns.map((column) => (
                <TableCell key={column.key}>{column.cell(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
