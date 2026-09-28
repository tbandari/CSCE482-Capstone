import { apiFetch } from '@/lib/api/client';
import type { FeedbackAction, NextPlaces, Recommendations } from '@/lib/recommendations/types';

export const DEFAULT_LIMIT = 20;
export const NEARBY_RADIUS_M = 2000;

export function fetchRecommendations(token: string, limit = DEFAULT_LIMIT): Promise<Recommendations> {
  return apiFetch<Recommendations>(`/recommendations?limit=${limit}`, { token });
}

export function fetchNearbyRecommendations(
  token: string,
  where: { lat: number; lon: number; radiusM?: number; limit?: number },
): Promise<Recommendations> {
  const query = new URLSearchParams({
    lat: String(where.lat),
    lon: String(where.lon),
    radius_m: String(where.radiusM ?? NEARBY_RADIUS_M),
    limit: String(where.limit ?? DEFAULT_LIMIT),
  });
  return apiFetch<Recommendations>(`/recommendations/nearby?${query.toString()}`, { token });
}

export function sendFeedback(token: string, placeId: number, action: FeedbackAction): Promise<void> {
  return apiFetch<void>(`/recommendations/${placeId}/feedback`, { method: 'POST', token, body: { action } });
}

export function fetchNextPlaces(token: string, atTs?: number): Promise<NextPlaces> {
  return apiFetch<NextPlaces>(atTs == null ? '/predict/next' : `/predict/next?at_ts=${atTs}`, { token });
}
