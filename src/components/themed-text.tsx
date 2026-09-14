import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const variants = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: Fonts?.mono, fontVariant: ['tabular-nums'] },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof variants;

/** Variants that default to the secondary text color. */
const secondaryByDefault: ReadonlySet<TextVariant> = new Set(['subhead', 'caption']);

export type ThemedTextProps = TextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
};

export function ThemedText({ style, variant = 'body', color, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const themeColor = color ?? (secondaryByDefault.has(variant) ? 'textSecondary' : 'text');
  return <Text style={[styles[variant], { color: theme[themeColor] }, style]} {...rest} />;
}

const styles = StyleSheet.create(variants);
