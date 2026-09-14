import { Stack } from 'expo-router';

export default function TimelineStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Timeline', headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
