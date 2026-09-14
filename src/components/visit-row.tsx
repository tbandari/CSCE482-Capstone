import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCoordinates, formatDistance, formatDuration, formatTime } from '@/lib/format';
import type { Visit } from '@/lib/types';

export function VisitRow({ visit, onPress }: { visit: Visit; onPress: () => void }) {
  const theme = useTheme();
  const duration = visit.endTs - visit.startTs;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Visit from ${formatTime(visit.startTs)} to ${formatTime(visit.endTs)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
        backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
      })}>
      <View style={{ flex: 1, gap: Spacing.half }}>
        <ThemedText variant="headline">
          {formatTime(visit.startTs)} – {formatTime(visit.endTs)}
        </ThemedText>
        <ThemedText variant="subhead">{visit.label ?? formatCoordinates(visit.lat, visit.lon)}</ThemedText>
        <ThemedText variant="caption">
          {visit.pointCount} fixes · within {formatDistance(visit.radius)}
        </ThemedText>
      </View>
      <View
        style={{
          backgroundColor: theme.accentSoft,
          borderRadius: Radius.full,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.one,
        }}>
        <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {formatDuration(duration)}
        </ThemedText>
      </View>
      <Icon sf="chevron.right" md="chevron_right" size={14} color={theme.textTertiary} />
    </Pressable>
  );
}
