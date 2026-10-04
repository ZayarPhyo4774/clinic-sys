import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RecordList, RowText, StatusRow } from "@/components/record-list";
import { ErrorState, LoadingState } from "@/components/states";
import { colors, Notice } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import { api } from "@/lib/api/client";
import type { LabOrder, LabOrderItem, LabResult, Page } from "@/lib/api/types";
import { formatWhen, shortId } from "@/lib/format";

export function LaboratoryScreen({ showResults = false }: { showResults?: boolean }) {
  const title = showResults ? "Laboratory results" : "Laboratory";
  return (
    <RequirePermission permission="laboratory.view" title={title}>
      {showResults ? <ResultOrders /> : <OrderList title={title} />}
    </RequirePermission>
  );
}

function OrderList({ title, onSelect }: { title: string; onSelect?: (order: LabOrder) => void }) {
  return (
    <RecordList<LabOrder>
      title={title}
      resource="lab-orders"
      path="/lab-orders/"
      emptyLabel="lab orders"
      renderItem={(row) => (
        <Pressable accessibilityRole="button" disabled={!onSelect} onPress={() => onSelect?.(row)}>
          <View style={styles.item}>
            <StatusRow value={row.status} />
            <RowText label="Ordered" value={formatWhen(row.created_at)} />
            <RowText label="Reported" value={formatWhen(row.reported_at)} />
            <RowText label="Patient" value={shortId(row.patient)} />
          </View>
        </Pressable>
      )}
    />
  );
}

function ResultOrders() {
  const [order, setOrder] = useState<LabOrder | null>(null);
  if (order) {
    return <OrderResults order={order} onBack={() => setOrder(null)} />;
  }
  return <OrderList title="Laboratory results" onSelect={setOrder} />;
}

function OrderResults({ order, onBack }: { order: LabOrder; onBack: () => void }) {
  const query = useQuery({
    queryKey: ["lab-results", order.id],
    queryFn: () => loadResults(order.id),
  });

  return (
    <View style={styles.results}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>Back to orders</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        Results
      </Text>
      <StatusRow value={order.status} />
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data && query.data.length === 0 ? <Notice>No results are recorded for this order.</Notice> : null}
      {query.data?.map((result) => (
        <View key={result.id} style={styles.card}>
          <RowText label="Value" value={`${result.value} ${result.unit}`.trim()} />
          <RowText label="Interpretation" value={result.interpretation} />
          <StatusRow value={result.status} />
        </View>
      ))}
    </View>
  );
}

async function loadResults(orderId: string) {
  const items = await api<Page<LabOrderItem>>(`/lab-orders/${orderId}/items/`);
  const results: LabResult[] = [];
  for (const item of items.results) {
    const page = await api<Page<LabResult>>(`/lab-orders/${orderId}/items/${item.id}/results/`);
    results.push(...page.results);
  }
  return results;
}

const styles = StyleSheet.create({
  item: {
    gap: 6,
  },
  results: {
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  back: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
});
