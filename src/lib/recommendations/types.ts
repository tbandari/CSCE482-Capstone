/**
 * Recommendations and next-place predictions exactly as the API returns them.
 * snake_case because this is the wire format; convert at the edges, not here.
 */

export interface PlaceRef {
  id: number;
  name: string | null;
  category: string;
  lat: number;
  lon: number;
}

export interface RecommendedPlace {
  place: PlaceRef;
  /** 0..1, comparable within one response. */
  score: number;
  /** One short line, already human-readable. */
  reason: string;
  /** Only from /recommendations/nearby. */
  distance_m?: number;
}

export interface Recommendations {
  generated_at: number;
  items: RecommendedPlace[];
}

export interface NextPlacePrediction {
  place: PlaceRef;
  /** 0..1. */
  probability: number;
  /** 1-based. */
  rank: number;
}

export interface NextPlaces {
  generated_at: number;
  at_ts: number;
  predictions: NextPlacePrediction[];
}

export type FeedbackAction = 'saved' | 'dismissed';

export type DiscoverMode = 'for-you' | 'nearby';
