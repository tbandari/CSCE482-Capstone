/**
 * A small themed segmented control. `@expo/ui`'s universal Picker (SDK 57) only
 * offers menu and wheel appearances, and a native segmented control would need
 * separate SwiftUI and Compose trees plus a web fallback, so this one control
 * covers every platform.
 */

import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        padding: Spacing.half,
        gap: Spacing.half,
        backgroundColor: theme.backgroundElement,
        borderRadius: Radius.full,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
      }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              minHeight: 32,
              justifyContent: 'center',
              paddingHorizontal: Spacing.four,
              borderRadius: Radius.full,
              backgroundColor: selected ? theme.accent : pressed ? theme.backgroundSelected : 'transparent',
            })}>
            <ThemedText
              variant="caption"
              style={{ color: selected ? theme.accentContrast : theme.text, fontWeight: selected ? '600' : '400' }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
