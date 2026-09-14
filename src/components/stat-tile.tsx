import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 120,
        backgroundColor: theme.backgroundElement,
        borderRadius: Radius.lg,
        borderCurve: 'continuous',
        padding: Spacing.four,
        gap: Spacing.half,
      }}>
      <ThemedText variant="caption">{label}</ThemedText>
      <ThemedText variant="title" style={{ fontVariant: ['tabular-nums'] }} selectable>
        {value}
      </ThemedText>
      {hint ? <ThemedText variant="caption">{hint}</ThemedText> : null}
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>{children}</View>;
}
