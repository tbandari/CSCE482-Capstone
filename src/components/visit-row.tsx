import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, formatTime } from '@/lib/format';
import { visitCategory, visitTitle } from '@/lib/place-label';
import { categoryInfo } from '@/lib/profile/categories';
import type { Visit } from '@/lib/types';

export function VisitRow({ visit, onPress }: { visit: Visit; onPress: () => void }) {
  const theme = useTheme();
  const duration = visit.endTs - visit.startTs;
  const category = visitCategory(visit);
  const info = category ? categoryInfo(category) : null;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
          {info ? <Icon sf={info.sf} md={info.md} size={13} color={theme.textSecondary} /> : null}
          <ThemedText variant="subhead" numberOfLines={1} style={{ flexShrink: 1 }}>
            {visitTitle(visit)}
          </ThemedText>
        </View>
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
