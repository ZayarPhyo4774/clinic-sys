import { Stack } from "expo-router";

import { RequireWorkspace } from "@/features/access/guards";

export default function NurseLayout() {
  return (
    <RequireWorkspace workspace="nurse">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#f4f7f8" },
          headerTintColor: "#12343b",
          contentStyle: { backgroundColor: "#f4f7f8" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Nurse" }} />
        <Stack.Screen name="queue" options={{ title: "Queue" }} />
        <Stack.Screen name="patients" options={{ title: "Patient" }} />
        <Stack.Screen name="vitals" options={{ title: "Vital signs" }} />
      </Stack>
    </RequireWorkspace>
  );
}
