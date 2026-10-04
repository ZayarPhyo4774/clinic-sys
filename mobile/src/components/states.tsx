import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/components/ui";
import { describeError } from "@/lib/api/errors";

export function LoadingState() {
  return (
    <View style={styles.block} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>Loading…</Text>
    </View>
  );
}

export function MessageState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{detail}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <MessageState title="Something went wrong" detail={describeError(error)} onRetry={onRetry} />;
}

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  autoComplete,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoComplete?: "email" | "password" | "off";
  keyboardType?: "default" | "email-address" | "decimal-pad" | "number-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline ? styles.multiline : null]}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 28,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
  },
  muted: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    marginTop: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: "600",
  },
  field: {
    gap: 6,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  multiline: {
    minHeight: 96,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
});
