import { Stack } from 'expo-router';

export default function MapStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Map' }} />
    </Stack>
  );
}
