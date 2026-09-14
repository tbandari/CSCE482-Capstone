/**
 * Deterministic synthetic week of movement around College Station, TX.
 *
 * Used for (1) the "Load sample week" button so the app is demoable without a
 * real export, and (2) the stay-detection evaluation, where the generated
 * schedule is the ground truth.
 */

import { haversineMeters, offsetMeters, type LatLon } from '@/lib/geo/distance';
import type { LocationPoint } from '@/lib/types';

export interface SamplePlace extends LatLon {
  name: string;
}

export const SAMPLE_PLACES = {
  home: { name: 'Home', lat: 30.6079, lon: -96.3217 },
  zachry: { name: 'Zachry Engineering Complex', lat: 30.6212, lon: -96.3403 },
  library: { name: 'Evans Library', lat: 30.616, lon: -96.3393 },
  rec: { name: 'Student Rec Center', lat: 30.6073, lon: -96.3436 },
  grocery: { name: 'Grocery store', lat: 30.6275, lon: -96.3175 },
  coffee: { name: 'Northgate coffee', lat: 30.6222, lon: -96.3465 },
  kyle: { name: 'Kyle Field', lat: 30.6101, lon: -96.3402 },
} as const satisfies Record<string, SamplePlace>;

export interface GroundTruthStay extends LatLon {
  name: string;
  startTs: number;
  endTs: number;
}

export interface SampleWeek {
  points: LocationPoint[];
  stays: GroundTruthStay[];
}

/** mulberry32: tiny seedable PRNG so tests and demos are reproducible. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gaussian = () => {
    const u = Math.max(next(), Number.EPSILON);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, gaussian };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WALK_MPS = 1.4;
const DRIVE_MPS = 9;
/** Quiet time at each end of a trip: unlocking the door, finding the car. */
const TRAVEL_BUFFER_MS = 30 * 1000;

type Slot = { place: SamplePlace; start: number; end: number }; // hours from midnight

/** Weekly schedule: index 0 is the day `weekStartTs` falls on (intended to be Monday). */
function scheduleFor(dayIndex: number): Slot[] {
  const P = SAMPLE_PLACES;
  switch (dayIndex) {
    case 0: // Mon
    case 2: // Wed
      return [
        { place: P.home, start: 0, end: 8.25 },
        { place: P.zachry, start: 8.75, end: 12 },
        { place: P.library, start: 12.2, end: 15 },
        { place: P.home, start: 15.5, end: 24 },
      ];
    case 1: // Tue
    case 3: // Thu
      return [
        { place: P.home, start: 0, end: 8.25 },
        { place: P.zachry, start: 8.75, end: 14.5 },
        { place: P.rec, start: 17.5, end: 18.75 },
        { place: P.home, start: 19.25, end: 24 },
      ];
    case 4: // Fri
      return [
        { place: P.home, start: 0, end: 9 },
        { place: P.zachry, start: 9.5, end: 13 },
        { place: P.coffee, start: 13.25, end: 14 },
        { place: P.home, start: 14.5, end: 24 },
      ];
    case 5: // Sat
      return [
        { place: P.home, start: 0, end: 10 },
        { place: P.grocery, start: 10.5, end: 11.25 },
        { place: P.home, start: 11.75, end: 13.5 },
        { place: P.kyle, start: 14, end: 18 },
        { place: P.home, start: 18.75, end: 24 },
      ];
    default: // Sun
      return [
        { place: P.home, start: 0, end: 9.75 },
        { place: P.coffee, start: 10, end: 11.5 },
        { place: P.library, start: 13, end: 17 },
        { place: P.home, start: 17.5, end: 24 },
      ];
  }
}

export interface SampleOptions {
  seed?: number;
  /** Seconds between points while stationary. */
  stayIntervalS?: number;
  /** Seconds between points while moving. */
  travelIntervalS?: number;
  /** Standard deviation of position jitter while stationary, in meters. */
  jitterM?: number;
}

/**
 * Generates one week of points starting at `weekStartTs` (local midnight of a Monday).
 * Ground-truth stays are returned alongside so detection quality can be measured.
 */
export function generateSampleWeek(weekStartTs: number, options: SampleOptions = {}): SampleWeek {
  const { seed = 42, stayIntervalS = 300, travelIntervalS = 30, jitterM = 12 } = options;
  const random = createRandom(seed);
  const points: LocationPoint[] = [];
  const stays: GroundTruthStay[] = [];

  const jitter = (place: LatLon) =>
    offsetMeters(place, random.gaussian() * jitterM, random.gaussian() * jitterM);

  const pushPoint = (ts: number, loc: LatLon, accuracy: number, speed: number | null) => {
    points.push({
      ts: Math.round(ts),
      lat: loc.lat,
      lon: loc.lon,
      accuracy: Math.round(accuracy),
      altitude: null,
      speed,
      source: 'import',
      importId: 'sample-week',
    });
  };

  // Flatten the week into one chronological list of stays first.
  for (let day = 0; day < 7; day += 1) {
    const dayStart = weekStartTs + day * DAY;
    for (const slot of scheduleFor(day)) {
      stays.push({
        name: slot.place.name,
        lat: slot.place.lat,
        lon: slot.place.lon,
        startTs: dayStart + slot.start * HOUR,
        endTs: dayStart + slot.end * HOUR,
      });
    }
  }
  // Consecutive "home" slots across midnight are one continuous stay.
  const mergedStays: GroundTruthStay[] = [];
  for (const stay of stays) {
    const previous = mergedStays[mergedStays.length - 1];
    if (previous && previous.name === stay.name && stay.startTs - previous.endTs <= MINUTE) {
      previous.endTs = stay.endTs;
    } else {
      mergedStays.push({ ...stay });
    }
  }

  for (let index = 0; index < mergedStays.length; index += 1) {
    const stay = mergedStays[index];
    // Stationary samples with jitter.
    for (let ts = stay.startTs; ts <= stay.endTs; ts += stayIntervalS * 1000) {
      const wobble = (random.next() - 0.5) * 60 * 1000;
      pushPoint(ts + wobble, jitter(stay), 10 + random.next() * 25, 0);
    }
    // Travel to the next stay: walk short hops, drive long ones. If the schedule
    // leaves more time than the trip needs, the person simply arrives early and
    // the ground-truth start moves up to the arrival time.
    const next = mergedStays[index + 1];
    if (!next) continue;
    const distance = haversineMeters(stay.lat, stay.lon, next.lat, next.lon);
    let speed = distance < 1500 ? WALK_MPS : DRIVE_MPS;
    let travelMs = (distance / speed) * 1000 + 2 * TRAVEL_BUFFER_MS;
    const gap = next.startTs - stay.endTs;
    if (gap < travelMs) {
      travelMs = gap;
      speed = distance / Math.max(1, (gap - 2 * TRAVEL_BUFFER_MS) / 1000);
    } else {
      next.startTs = stay.endTs + travelMs;
    }
    const travelStart = stay.endTs + TRAVEL_BUFFER_MS;
    const travelEnd = next.startTs - TRAVEL_BUFFER_MS;
    const movingMs = travelEnd - travelStart;
    if (movingMs <= 0) continue;
    const steps = Math.max(1, Math.floor(movingMs / (travelIntervalS * 1000)));
    for (let k = 1; k < steps; k += 1) {
      const f = k / steps;
      const loc = offsetMeters(
        { lat: stay.lat + (next.lat - stay.lat) * f, lon: stay.lon + (next.lon - stay.lon) * f },
        random.gaussian() * 6,
        random.gaussian() * 6,
      );
      pushPoint(travelStart + movingMs * f, loc, 5 + random.next() * 15, speed);
    }
  }

  points.sort((a, b) => a.ts - b.ts);
  return { points, stays: mergedStays };
}

/** Local midnight of the most recent Monday that started at least a full week ago. */
export function lastCompleteWeekStart(now = new Date()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday - 7);
  return start.getTime();
}
