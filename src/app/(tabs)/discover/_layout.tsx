import { Stack } from 'expo-router';

export default function DiscoverStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Discover', headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
