/**
 * Grouped list primitives in the style of a native settings screen: a titled
 * section holding rows separated by hairlines. Rows are Pressable when given
 * `onPress`; otherwise they are static.
 */

import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: Spacing.two }}>
      {title ? (
        <ThemedText variant="caption" style={{ paddingHorizontal: Spacing.four, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {title}
        </ThemedText>
      ) : null}
      <View
        style={{
          backgroundColor: theme.backgroundElement,
          borderRadius: Radius.lg,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: theme.separator,
                  marginLeft: Spacing.four,
                }}
              />
            ) : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? (
        <ThemedText variant="caption" style={{ paddingHorizontal: Spacing.four }}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  /** Text shown at the trailing edge, e.g. a value. */
  value?: string;
  /** Custom trailing element, e.g. a Switch. */
  accessory?: ReactNode;
  onPress?: () => void;
  titleColor?: ThemeColor;
  chevron?: boolean;
  disabled?: boolean;
}

export function Row({
  title,
  subtitle,
  value,
  accessory,
  onPress,
  titleColor,
  chevron = Boolean(onPress),
  disabled = false,
}: RowProps) {
  const theme = useTheme();
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
        minHeight: 48,
      }}>
      <View style={{ flex: 1, gap: Spacing.half }}>
        <ThemedText variant="body" color={titleColor}>
          {title}
        </ThemedText>
        {subtitle ? <ThemedText variant="subhead">{subtitle}</ThemedText> : null}
      </View>
      {value ? (
        <ThemedText variant="subhead" selectable style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </ThemedText>
      ) : null}
      {accessory}
      {chevron ? (
        <Icon sf="chevron.right" md="chevron_right" size={14} color={theme.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
        opacity: disabled ? 0.4 : 1,
      })}>
      {content}
    </Pressable>
  );
}
