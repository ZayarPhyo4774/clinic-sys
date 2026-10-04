import { Stack } from "expo-router";

import { RequireWorkspace } from "@/features/access/guards";

export default function DoctorLayout() {
  return (
    <RequireWorkspace workspace="doctor">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#f4f7f8" },
          headerTintColor: "#12343b",
          contentStyle: { backgroundColor: "#f4f7f8" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Doctor" }} />
        <Stack.Screen name="appointments" options={{ title: "Today's appointments" }} />
        <Stack.Screen name="queue" options={{ title: "Queue" }} />
        <Stack.Screen name="patients" options={{ title: "Patient" }} />
        <Stack.Screen name="consultation" options={{ title: "Consultation" }} />
        <Stack.Screen name="prescriptions" options={{ title: "Prescription" }} />
        <Stack.Screen name="laboratory" options={{ title: "Laboratory" }} />
      </Stack>
    </RequireWorkspace>
  );
}
