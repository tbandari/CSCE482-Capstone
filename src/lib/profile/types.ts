/**
 * The interest profile exactly as `GET /profile` returns it. Field names stay
 * snake_case because this is the wire format; convert at the edges, not here.
 */

export interface InterestWeight {
  category: string;
  /** 0..1. Weights of the non-hidden interests sum to 1. */
  weight: number;
  visits: number;
  dwell_minutes: number;
  hidden: boolean;
}

export interface TopPlace {
  place_id: number;
  name: string | null;
  category: string;
  visits: number;
  /** Epoch milliseconds (UTC). */
  last_visit_ts: number;
}

export interface InterestProfile {
  /** Epoch milliseconds (UTC). */
  generated_at: number;
  total_visits: number;
  resolved_visits: number;
  interests: InterestWeight[];
  top_places: TopPlace[];
}
