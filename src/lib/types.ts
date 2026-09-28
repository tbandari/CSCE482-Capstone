/**
 * Core domain types shared by the store, the import pipeline and the UI.
 *
 * Everything in Orbit derives from `LocationPoint`s. Visits are always computed
 * from points (see `lib/stays`), never stored as an independent source of truth,
 * so re-running the pipeline with better parameters is always safe.
 */

export type PointSource = 'device' | 'import';

export interface LocationPoint {
  id?: number;
  /** Epoch milliseconds (UTC). */
  ts: number;
  lat: number;
  lon: number;
  /** Horizontal accuracy radius in meters, or null if the source did not report one. */
  accuracy: number | null;
  /** Altitude in meters, or null. */
  altitude: number | null;
  /** Ground speed in m/s, or null. */
  speed: number | null;
  source: PointSource;
  /** Id of the import that produced this point; null for live device points. */
  importId: string | null;
}

export interface Visit {
  id?: number;
  startTs: number;
  endTs: number;
  /** Centroid of the stay. */
  lat: number;
  lon: number;
  /** Radius in meters around the centroid that contains every point of the stay. */
  radius: number;
  pointCount: number;
  /** Semantic or user label ("Home"). */
  label: string | null;
  /**
   * The place the server resolved this visit to. Null for a visit computed on
   * this phone until the next sync brings the server's answer down.
   */
  placeId: number | null;
  placeName: string | null;
  placeCategory: string | null;
  /** 0..1 from the place ranker. */
  placeConfidence: number | null;
}

export type TimelineFormat = 'android-semantic' | 'ios-semantic' | 'legacy-records';

export interface ImportRecord {
  id: string;
  fileName: string;
  format: TimelineFormat | 'sample';
  importedAt: number;
  pointCount: number;
}

export interface DataStats {
  points: number;
  devicePoints: number;
  visits: number;
  imports: number;
  firstTs: number | null;
  lastTs: number | null;
}
