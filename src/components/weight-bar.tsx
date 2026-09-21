import { View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A thin horizontal bar showing a share from 0 to 1. Announced as a percentage. */
export function WeightBar({ value, label, muted = false }: { value: number; label: string; muted?: boolean }) {
  const theme = useTheme();
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
      style={{ height: 6, borderRadius: Radius.full, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
      <View
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: Radius.full,
          backgroundColor: muted ? theme.textTertiary : theme.accent,
        }}
      />
    </View>
  );
}
