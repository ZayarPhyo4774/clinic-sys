import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { Field } from "@/components/states";
import { colors, Notice } from "@/components/ui";
import { RequirePermission } from "@/features/access/guards";
import { api } from "@/lib/api/client";
import { describeError, fieldMessages } from "@/lib/api/errors";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

export function BookAppointmentScreen() {
  return (
    <RequirePermission permission="appointments.create" title="Book appointment">
      <BookForm />
    </RequirePermission>
  );
}

function BookForm() {
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState("");
  const [doctor, setDoctor] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("appointments.book", isOnline());
      return api("/appointments/", {
        method: "POST",
        body: JSON.stringify({
          patient,
          doctor,
          starts_at: startsAt,
          ends_at: endsAt,
          visit_reason: visitReason,
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      setVisitReason("");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (caught) => setError(caught),
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Book appointment
      </Text>
      <Notice>The clinic API assigns the visit and checks the time.</Notice>
      <Field label="Patient" value={patient} onChangeText={setPatient} autoComplete="off" />
      <Alert error={error} name="patient" />
      <Field label="Doctor" value={doctor} onChangeText={setDoctor} autoComplete="off" />
      <Alert error={error} name="doctor" />
      <Field label="Starts at" value={startsAt} onChangeText={setStartsAt} autoComplete="off" />
      <Alert error={error} name="starts_at" />
      <Field label="Ends at" value={endsAt} onChangeText={setEndsAt} autoComplete="off" />
      <Alert error={error} name="ends_at" />
      <Field label="Visit reason" value={visitReason} onChangeText={setVisitReason} autoComplete="off" />
      <Alert error={error} name="visit_reason" />
      <Pressable
        accessibilityRole="button"
        disabled={mutation.isPending}
        style={styles.button}
        onPress={() => mutation.mutate()}
      >
        <Text style={styles.buttonText}>{mutation.isPending ? "Booking…" : "Book appointment"}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {describeError(error)}
        </Text>
      ) : null}
      {mutation.isSuccess ? <Notice>The appointment was booked.</Notice> : null}
    </ScrollView>
  );
}

function Alert({ error, name }: { error: unknown; name: string }) {
  const messages = fieldMessages(error, name);
  if (messages.length === 0) {
    return null;
  }
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {messages.join(" ")}
    </Text>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    gap: 12,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
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
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
