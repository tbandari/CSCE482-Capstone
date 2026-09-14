// Defines the background location task at module scope (required by TaskManager).
import '@/lib/location/background-task';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { useIsDark } from '@/hooks/use-theme';
import { resumeTrackingIfEnabled } from '@/lib/location/tracking';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const dark = useIsDark();
  const palette = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.separator,
    },
  };

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    resumeTrackingIfEnabled().catch((error) => console.warn('could not resume tracking', error));
  }, []);

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="visit/[id]"
          options={{
            headerShown: true,
            title: 'Visit',
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.65, 1],
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
