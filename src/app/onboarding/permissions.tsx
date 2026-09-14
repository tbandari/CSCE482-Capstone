import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Row, Section } from '@/components/grouped-list';
import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { startTracking } from '@/lib/location/tracking';
import { settings } from '@/lib/settings';

export default function PermissionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    settings.set('onboardingComplete', true);
    router.replace('/map');
  };

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await startTracking();
      if (status.mode === 'off') {
        setError(status.error ?? 'Location permission was not granted.');
        setBusy(false);
        return;
      }
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        gap: Spacing.six,
        paddingHorizontal: Spacing.five,
        paddingTop: insets.top + Spacing.eight,
        paddingBottom: insets.bottom + Spacing.six,
        maxWidth: MaxContentWidth,
        width: '100%',
        alignSelf: 'center',
      }}>
      <View style={{ gap: Spacing.three }}>
        <ThemedText variant="largeTitle">Record where you go</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          Orbit needs your location to build a timeline. Fixes are stored on this phone and nothing
          is uploaded until you choose to sync an account.
        </ThemedText>
      </View>

      <Section>
        <Row
          title="While using the app"
          subtitle="Records whenever Orbit is open. This is all Expo Go allows."
        />
        <Row
          title="Always"
          subtitle="Records in the background with low-power batching. Needs a development build."
        />
        <Row title="You stay in control" subtitle="Pause, export or delete everything from Settings." />
      </Section>

      {error ? <Notice kind="error" message={error} /> : null}

      <View style={{ gap: Spacing.three }}>
        <Button title="Allow location" size="lg" loading={busy} onPress={enable} />
        <Button title="Not now" variant="ghost" disabled={busy} onPress={finish} />
      </View>
    </ScrollView>
  );
}
