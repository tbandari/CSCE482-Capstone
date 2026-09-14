import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon, type MaterialName, type SFName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const FEATURES: { sf: SFName; md: MaterialName; title: string; text: string }[] = [
  {
    sf: 'location.fill',
    md: 'location_on',
    title: 'Keeps recording',
    text: 'Low-power background tracking, so your history keeps growing and survives your next phone.',
  },
  {
    sf: 'square.and.arrow.down',
    md: 'download',
    title: 'Brings your history along',
    text: 'Import the export Google Maps generates on your phone. No desktop, no file transfer.',
  },
  {
    sf: 'lock.fill',
    md: 'lock',
    title: 'A vault, not a product',
    text: 'Stored on this device. Export everything or delete it permanently in one tap.',
  },
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        gap: Spacing.eight,
        paddingHorizontal: Spacing.five,
        paddingTop: insets.top + Spacing.eight,
        paddingBottom: insets.bottom + Spacing.six,
        maxWidth: MaxContentWidth,
        width: '100%',
        alignSelf: 'center',
      }}>
      <View style={{ gap: Spacing.four }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: Radius.lg,
            borderCurve: 'continuous',
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon sf="circle.circle" md="radio_button_checked" size={30} color={theme.accentContrast} />
        </View>
        <ThemedText variant="largeTitle">Orbit</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          Your location history, owned by you. Recorded on your phone, readable by you, never sold.
        </ThemedText>
      </View>

      <View style={{ gap: Spacing.five }}>
        {FEATURES.map((feature) => (
          <View key={feature.title} style={{ flexDirection: 'row', gap: Spacing.four }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: Radius.md,
                borderCurve: 'continuous',
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon sf={feature.sf} md={feature.md} size={20} color={theme.accent} />
            </View>
            <View style={{ flex: 1, gap: Spacing.half }}>
              <ThemedText variant="headline">{feature.title}</ThemedText>
              <ThemedText variant="subhead">{feature.text}</ThemedText>
            </View>
          </View>
        ))}
      </View>

      <Button title="Get started" size="lg" onPress={() => router.push('/onboarding/permissions')} />
    </ScrollView>
  );
}
