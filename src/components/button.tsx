import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'md' | 'lg';

function paletteFor(variant: Variant, theme: Theme) {
  switch (variant) {
    case 'primary':
      return { background: theme.accent, color: theme.accentContrast };
    case 'destructive':
      return { background: theme.backgroundElement, color: theme.danger };
    case 'ghost':
      return { background: 'transparent', color: theme.accent };
    default:
      return { background: theme.backgroundElement, color: theme.text };
  }
}

const sizes: Record<Size, ViewStyle> = {
  md: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, minHeight: 44 },
  lg: { paddingVertical: Spacing.four, paddingHorizontal: Spacing.five, minHeight: 52 },
};

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const palette = paletteFor(variant, theme);
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: palette.background,
          borderRadius: Radius.md,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          ...sizes[size],
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.color} />
      ) : (
        <ThemedText variant="headline" style={{ color: palette.color }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}
