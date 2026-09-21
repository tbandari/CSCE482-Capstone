import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Section } from '@/components/grouped-list';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { StatRow, StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { WeightBar } from '@/components/weight-bar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayHeading, formatDuration } from '@/lib/format';
import { categoryInfo } from '@/lib/profile/categories';
import type { InterestWeight, TopPlace } from '@/lib/profile/types';
import { useInterestProfile } from '@/lib/profile/use-interest-profile';

export default function ProfileScreen() {
  const theme = useTheme();
  const { profile, loading, error, isSample, setHidden } = useInterestProfile();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !profile) {
    return (
      <View style={{ flex: 1, padding: Spacing.five, backgroundColor: theme.background }}>
        <ThemedText color="danger" selectable>
          {error ?? 'Could not load your profile.'}
        </ThemedText>
      </View>
    );
  }

  const resolvedShare = profile.total_visits > 0 ? Math.round((profile.resolved_visits / profile.total_visits) * 100) : 0;
  const top = profile.interests.find((i) => !i.hidden);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        padding: Spacing.four,
        gap: Spacing.five,
        maxWidth: MaxContentWidth,
        width: '100%',
        alignSelf: 'center',
      }}>
      {isSample ? <Notice kind="info" message="Sample profile: sign in and sync to see yours." /> : null}

      <StatRow>
        <StatTile label="Visits" value={String(profile.total_visits)} />
        <StatTile
          label="Matched to places"
          value={`${resolvedShare}%`}
          hint={`${profile.resolved_visits} of ${profile.total_visits}`}
        />
        <StatTile label="Top interest" value={top ? categoryInfo(top.category).label : '—'} />
      </StatRow>

      {profile.interests.length === 0 ? (
        <EmptyState
          sf="person.crop.circle"
          md="person"
          title="No interests yet"
          message="Your interests appear once some of your visits are matched to places."
        />
      ) : (
        <Section title="Interests" footer="Built from the places you visit and how long you stay. Hidden interests are left out everywhere.">
          {profile.interests.map((interest) => (
            <InterestRow
              key={interest.category}
              interest={interest}
              onToggle={(visible) => setHidden(interest.category, !visible)}
            />
          ))}
        </Section>
      )}

      {profile.top_places.length > 0 ? (
        <Section title="Top places">
          {profile.top_places.map((place) => (
            <PlaceRow key={place.place_id} place={place} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function CategoryBadge({ category, muted = false }: { category: string; muted?: boolean }) {
  const theme = useTheme();
  const info = categoryInfo(category);
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: Radius.full,
        backgroundColor: muted ? theme.backgroundSelected : theme.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon sf={info.sf} md={info.md} size={18} color={muted ? theme.textTertiary : theme.accent} />
    </View>
  );
}

function InterestRow({ interest, onToggle }: { interest: InterestWeight; onToggle: (visible: boolean) => void }) {
  const theme = useTheme();
  const { label } = categoryInfo(interest.category);
  const percent = Math.round(interest.weight * 100);
  const hours = formatDuration(interest.dwell_minutes * 60_000);
  const detail = `${interest.visits} ${interest.visits === 1 ? 'visit' : 'visits'} · ${hours}`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
      }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, opacity: interest.hidden ? 0.45 : 1 }}>
        <CategoryBadge category={interest.category} muted={interest.hidden} />
        <View style={{ flex: 1, gap: Spacing.one }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
            <ThemedText variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
              {label}
            </ThemedText>
            <ThemedText variant="subhead" style={{ fontVariant: ['tabular-nums'] }}>
              {interest.hidden ? 'Hidden' : `${percent}%`}
            </ThemedText>
          </View>
          <WeightBar
            value={interest.weight}
            muted={interest.hidden}
            label={interest.hidden ? `${label}, hidden` : `${label}, ${percent}% of your interests`}
          />
          <ThemedText variant="caption">{detail}</ThemedText>
        </View>
      </View>
      <Switch
        value={!interest.hidden}
        onValueChange={onToggle}
        trackColor={{ true: theme.accent }}
        accessibilityLabel={`Show ${label} in your profile`}
      />
    </View>
  );
}

function PlaceRow({ place }: { place: TopPlace }) {
  const name = place.name ?? 'Unnamed place';
  const visits = `${place.visits} ${place.visits === 1 ? 'visit' : 'visits'}`;
  const day = formatDayHeading(place.last_visit_ts);
  const last = `last visit ${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day}`;
  return (
    <View
      accessible
      accessibilityLabel={`${name}, ${categoryInfo(place.category).label}, ${visits}, ${last}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
        minHeight: 48,
      }}>
      <CategoryBadge category={place.category} />
      <View style={{ flex: 1, gap: Spacing.half }}>
        <ThemedText variant="body" color={place.name ? 'text' : 'textSecondary'} numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText variant="caption">
          {categoryInfo(place.category).label} · {last}
        </ThemedText>
      </View>
      <ThemedText variant="subhead" style={{ fontVariant: ['tabular-nums'] }}>
        {visits}
      </ThemedText>
    </View>
  );
}
