import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, type MaterialName, type SFName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function EmptyState({
  sf,
  md,
  title,
  message,
  children,
}: {
  sf: SFName;
  md: MaterialName;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: Spacing.four, padding: Spacing.six }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: Radius.full,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon sf={sf} md={md} size={28} color={theme.accent} />
      </View>
      <View style={{ alignItems: 'center', gap: Spacing.one }}>
        <ThemedText variant="headline" style={{ textAlign: 'center' }}>
          {title}
        </ThemedText>
        <ThemedText variant="subhead" style={{ textAlign: 'center', maxWidth: 320 }}>
          {message}
        </ThemedText>
      </View>
      {children ? <View style={{ gap: Spacing.two, alignSelf: 'stretch', maxWidth: 360, width: '100%' }}>{children}</View> : null}
    </View>
  );
}
