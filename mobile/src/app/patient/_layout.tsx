import { Stack } from "expo-router";

import { RequireWorkspace } from "@/features/access/guards";

export default function PatientLayout() {
  return (
    <RequireWorkspace workspace="patient">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#f4f7f8" },
          headerTintColor: "#12343b",
          contentStyle: { backgroundColor: "#f4f7f8" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Patient" }} />
        <Stack.Screen name="appointments" options={{ title: "Appointments" }} />
        <Stack.Screen name="book" options={{ title: "Book appointment" }} />
        <Stack.Screen name="queue" options={{ title: "Queue" }} />
        <Stack.Screen name="prescriptions" options={{ title: "Prescriptions" }} />
        <Stack.Screen name="laboratory" options={{ title: "Laboratory results" }} />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
      </Stack>
    </RequireWorkspace>
  );
}
