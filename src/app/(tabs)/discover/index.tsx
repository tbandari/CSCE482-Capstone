import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { WeightBar } from '@/components/weight-bar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance } from '@/lib/format';
import { categoryInfo } from '@/lib/profile/categories';
import { describeFeedback, formatProbability } from '@/lib/recommendations/feedback';
import type { DiscoverMode, NextPlacePrediction, RecommendedPlace } from '@/lib/recommendations/types';
import { useDiscover } from '@/lib/recommendations/use-discover';

const MODES: readonly SegmentOption<DiscoverMode>[] = [
  { value: 'for-you', label: 'For you' },
  { value: 'nearby', label: 'Nearby now' },
];

export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const discover = useDiscover();

  if (!discover.signedIn) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <EmptyState
          sf="sparkles"
          md="explore"
          title="Sign in to see suggestions"
          message="Orbit suggests places from your own interest profile, which lives in your account.">
          <Button title="Go to Settings" variant="secondary" onPress={() => router.push('/settings')} />
        </EmptyState>
      </View>
    );
  }

  if (discover.loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  const header = (
    <View style={{ gap: Spacing.four, paddingBottom: Spacing.two }}>
      {discover.error ? <Notice kind="error" message={discover.error} /> : null}
      {discover.pending ? (
        <View style={{ gap: Spacing.two }}>
          <Notice kind="info" message={describeFeedback(discover.pending)} />
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button title="Undo" variant="secondary" onPress={discover.undo} style={{ flex: 1 }} />
            <Button title="Keep" variant="ghost" onPress={discover.dismissPending} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}

      <NextPlaceCard predictions={discover.predictions} />

      <View style={{ alignSelf: 'flex-start' }}>
        <SegmentedControl
          options={MODES}
          value={discover.mode}
          onChange={discover.setMode}
          accessibilityLabel="Suggestion source"
        />
      </View>
      {discover.locationDenied ? (
        <Notice kind="info" message="Location is off, so these are your usual suggestions rather than nearby ones." />
      ) : null}
    </View>
  );

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        padding: Spacing.four,
        gap: Spacing.two,
        maxWidth: MaxContentWidth,
        width: '100%',
        alignSelf: 'center',
        flexGrow: 1,
      }}
      data={discover.items}
      keyExtractor={(item) => String(item.place.id)}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={discover.refreshing} onRefresh={discover.refresh} tintColor={theme.accent} />}
      renderItem={({ item }) => (
        <SuggestionCard item={item} onFeedback={discover.feedback} />
      )}
      ListEmptyComponent={
        <EmptyState
          sf="sparkles"
          md="explore"
          title="Nothing to suggest yet"
          message="Suggestions appear once enough of your visits are matched to places. Import or record a little more history, then sync."
        />
      }
    />
  );
}

function NextPlaceCard({ predictions }: { predictions: NextPlacePrediction[] }) {
  const theme = useTheme();
  // No prediction is better than a confident-looking 0%.
  if (predictions.length === 0) return null;

  const [top, ...rest] = predictions;
  const info = categoryInfo(top.place.category);
  return (
    <View
      accessible
      accessibilityLabel={`Likely next: ${top.place.name ?? 'an unnamed place'}, ${formatProbability(top.probability)}`}
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: Radius.lg,
        borderCurve: 'continuous',
        padding: Spacing.four,
        gap: Spacing.two,
      }}>
      <ThemedText variant="caption" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Likely next
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: Radius.full,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon sf={info.sf} md={info.md} size={18} color={theme.accent} />
        </View>
        <ThemedText variant="headline" numberOfLines={1} style={{ flex: 1 }}>
          {top.place.name ?? 'Unnamed place'}
        </ThemedText>
        <ThemedText variant="headline" style={{ fontVariant: ['tabular-nums'], color: theme.accent }}>
          {formatProbability(top.probability)}
        </ThemedText>
      </View>
      {rest.length > 0 ? (
        <ThemedText variant="caption">
          then {rest.map((p) => `${p.place.name ?? 'Unnamed place'} ${formatProbability(p.probability)}`).join(' · ')}
        </ThemedText>
      ) : null}
    </View>
  );
}

function SuggestionCard({
  item,
  onFeedback,
}: {
  item: RecommendedPlace;
  onFeedback: (placeId: number, action: 'saved' | 'dismissed') => void;
}) {
  const theme = useTheme();
  const info = categoryInfo(item.place.category);
  const name = item.place.name ?? 'Unnamed place';
  return (
    <View
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: Radius.lg,
        borderCurve: 'continuous',
        padding: Spacing.four,
        gap: Spacing.three,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: Radius.full,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon sf={info.sf} md={info.md} size={18} color={theme.accent} />
        </View>
        <View style={{ flex: 1, gap: Spacing.half }}>
          <ThemedText variant="body" numberOfLines={1} color={item.place.name ? 'text' : 'textSecondary'}>
            {name}
          </ThemedText>
          <ThemedText variant="caption">
            {info.label}
            {item.distance_m != null ? ` · ${formatDistance(item.distance_m)} away` : ''}
          </ThemedText>
        </View>
      </View>

      <ThemedText variant="subhead">{item.reason}</ThemedText>
      <WeightBar value={item.score} label={`Match for ${name}`} />

      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Button
          title="Save"
          variant="secondary"
          onPress={() => onFeedback(item.place.id, 'saved')}
          style={{ flex: 1 }}
        />
        <Button
          title="Dismiss"
          variant="ghost"
          onPress={() => onFeedback(item.place.id, 'dismissed')}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
