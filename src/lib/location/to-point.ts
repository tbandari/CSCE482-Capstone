import type { LocationObject } from 'expo-location';

import type { LocationPoint } from '@/lib/types';

export function toPoint(location: LocationObject): LocationPoint {
  const { coords, timestamp } = location;
  return {
    ts: Math.round(timestamp),
    lat: coords.latitude,
    lon: coords.longitude,
    accuracy: coords.accuracy ?? null,
    altitude: coords.altitude ?? null,
    // Platforms report -1 when speed is unknown.
    speed: coords.speed != null && coords.speed >= 0 ? coords.speed : null,
    source: 'device',
    importId: null,
  };
}
