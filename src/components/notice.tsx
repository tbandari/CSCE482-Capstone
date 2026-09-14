import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type NoticeKind = 'success' | 'error' | 'info';

export function Notice({ kind, message }: { kind: NoticeKind; message: string }) {
  const theme = useTheme();
  const tint = kind === 'error' ? theme.danger : kind === 'success' ? theme.success : theme.accent;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: Spacing.three,
        alignItems: 'flex-start',
        padding: Spacing.four,
        borderRadius: Radius.md,
        borderCurve: 'continuous',
        backgroundColor: `${tint}1F`,
      }}>
      <Icon
        sf={kind === 'error' ? 'exclamationmark.triangle.fill' : kind === 'success' ? 'checkmark.circle.fill' : 'info.circle.fill'}
        md={kind === 'error' ? 'warning' : kind === 'success' ? 'check_circle' : 'info'}
        size={20}
        color={tint}
        style={{ marginTop: 1 }}
      />
      <ThemedText variant="subhead" selectable style={{ flex: 1, color: theme.text }}>
        {message}
      </ThemedText>
    </View>
  );
}
