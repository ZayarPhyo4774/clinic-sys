import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Field, LoadingState } from "@/components/states";
import { colors } from "@/components/ui";
import { workspaceHome } from "@/features/access/workspace";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, fieldMessages } from "@/lib/api/errors";

export function LoginScreen() {
  const { signIn, account, isLoading, workspace } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    setError(null);
    setPending(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/");
    } catch (caught) {
      const fields = [...fieldMessages(caught, "email"), ...fieldMessages(caught, "password")];
      setError(fields[0] || (caught instanceof ApiError ? caught.message : "Sign-in failed."));
    } finally {
      setPending(false);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }
  if (account) {
    return <Redirect href={workspaceHome(workspace)} />;
  }

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Sign in
      </Text>
      <Text style={styles.detail}>Use the email and password issued for this clinic.</Text>
      <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="password"
        secureTextEntry
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" disabled={pending} style={styles.button} onPress={() => void onSubmit()}>
        <Text style={styles.buttonText}>{pending ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
  },
  detail: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: "600",
  },
});
