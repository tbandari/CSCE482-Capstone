import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/lib/api/session';
import { describeError } from '@/lib/describe-error';
import {
  fetchNearbyRecommendations,
  fetchNextPlaces,
  fetchRecommendations,
  sendFeedback,
} from '@/lib/recommendations/api';
import { applyFeedback, undoFeedback, type PendingFeedback } from '@/lib/recommendations/feedback';
import type {
  DiscoverMode,
  FeedbackAction,
  NextPlacePrediction,
  RecommendedPlace,
} from '@/lib/recommendations/types';

interface Loaded {
  items: RecommendedPlace[];
  predictions: NextPlacePrediction[];
}

export interface DiscoverState {
  items: RecommendedPlace[];
  predictions: NextPlacePrediction[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  signedIn: boolean;
  mode: DiscoverMode;
  setMode: (mode: DiscoverMode) => void;
  /** True when Nearby was asked for but the device won't give a position. */
  locationDenied: boolean;
  refresh: () => void;
  feedback: (placeId: number, action: FeedbackAction) => void;
  pending: PendingFeedback | null;
  undo: () => void;
  dismissPending: () => void;
}

const EMPTY: RecommendedPlace[] = [];
const NO_PREDICTIONS: NextPlacePrediction[] = [];

/**
 * Everything the Discover screen shows. Suggestions and the next-place
 * prediction load together, because a screen with half of each is worse than a
 * screen that waits a moment.
 */
export function useDiscover(): DiscoverState {
  const session = useSession();
  const token = session.token;
  const [mode, setMode] = useState<DiscoverMode>('for-you');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [pending, setPending] = useState<PendingFeedback | null>(null);
  const [version, setVersion] = useState(0);

  // Signed out there is nothing to load, so the empty state is derived here
  // rather than written from the effect below.
  const key = token && session.ready ? `${token}:${mode}:${version}` : null;
  const items = useMemo(() => (token ? (loaded?.items ?? EMPTY) : EMPTY), [token, loaded]);
  const predictions = token ? (loaded?.predictions ?? NO_PREDICTIONS) : NO_PREDICTIONS;
  const loading = key != null && loadedKey !== key && !refreshing;

  const refresh = useCallback(() => {
    setRefreshing(true);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (key == null || token == null) return undefined;
    let cancelled = false;

    const load = async () => {
      let recommendations;
      if (mode === 'nearby') {
        const position = await currentPosition();
        if (cancelled) return;
        setLocationDenied(position == null);
        recommendations = position
          ? await fetchNearbyRecommendations(token, position)
          : await fetchRecommendations(token);
      } else {
        setLocationDenied(false);
        recommendations = await fetchRecommendations(token);
      }
      const next = await fetchNextPlaces(token);
      if (cancelled) return;
      setLoaded({ items: recommendations.items, predictions: next.predictions });
      setPending(null);
      setError(null);
    };

    load()
      .catch((failure: unknown) => {
        if (!cancelled) setError(describeError(failure));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadedKey(key);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, token, mode]);

  const feedback = useCallback(
    (placeId: number, action: FeedbackAction) => {
      if (!token) return;
      const optimistic = applyFeedback(items, placeId, action);
      if (!optimistic.pending) return;
      setLoaded((current) => (current ? { ...current, items: optimistic.items } : current));
      setPending(optimistic.pending);

      sendFeedback(token, placeId, action).catch((failure: unknown) => {
        // The server didn't take it, so the row goes back where it was.
        setLoaded((current) =>
          current ? { ...current, items: undoFeedback(current.items, optimistic.pending) } : current,
        );
        setPending(null);
        setError(describeError(failure));
      });
    },
    [items, token],
  );

  const undo = useCallback(() => {
    if (!pending || !token) return;
    const restoring = pending;
    setLoaded((current) => (current ? { ...current, items: undoFeedback(current.items, restoring) } : current));
    setPending(null);
    // "Saved" is the default state again: there is no delete endpoint yet, so a
    // dismissed place is un-dismissed by saving it instead.
    sendFeedback(token, restoring.item.place.id, 'saved').catch((failure: unknown) => {
      setError(describeError(failure));
    });
  }, [pending, token]);

  const dismissPending = useCallback(() => setPending(null), []);

  return {
    items,
    predictions,
    loading,
    refreshing,
    error,
    signedIn: token != null,
    mode,
    setMode,
    locationDenied,
    refresh,
    feedback,
    pending,
    undo,
    dismissPending,
  };
}

async function currentPosition(): Promise<{ lat: number; lon: number } | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      const asked = await Location.requestForegroundPermissionsAsync();
      if (!asked.granted) return null;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch {
    return null;
  }
}
