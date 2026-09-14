import { Stack } from 'expo-router';

export default function ImportStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Import', headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
