import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { useSyncStatus } from "@/offline/connectivity/sync-provider";

export function SyncStatus() {
  const { account } = useAuth();
  const { status, failed, retry } = useSyncStatus();
  const [retrying, setRetrying] = useState(false);

  return (
    <View accessibilityLiveRegion="polite" style={styles.row}>
      <Text style={styles.badge}>{status}</Text>
      {status === "Failed" ? (
        <Pressable
          accessibilityRole="button"
          disabled={retrying}
          style={styles.retry}
          onPress={() => {
            setRetrying(true);
            void retry(account?.id ?? null).finally(() => setRetrying(false));
          }}
        >
          <Text style={styles.retryText}>{retrying ? "Retry" : failed > 0 ? `Retry ${failed}` : "Retry"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    backgroundColor: "#e7eef0",
    borderRadius: 6,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retry: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  retryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
