import { Stack } from "expo-router";

import { Providers } from "@/components/providers";

export default function RootLayout() {
  return (
    <Providers>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="doctor" />
        <Stack.Screen name="nurse" />
        <Stack.Screen name="patient" />
      </Stack>
    </Providers>
  );
}
