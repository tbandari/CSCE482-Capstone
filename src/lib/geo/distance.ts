/** Mean Earth radius in meters (IUGG). */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance between two coordinates in meters. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceBetween(a: LatLon, b: LatLon): number {
  return haversineMeters(a.lat, a.lon, b.lat, b.lon);
}

/**
 * Arithmetic-mean centroid. Accurate enough for clusters smaller than a few
 * kilometers, which is all stay detection ever produces.
 */
export function centroid(points: readonly LatLon[]): LatLon {
  if (points.length === 0) {
    throw new Error('centroid() needs at least one point');
  }
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / points.length, lon: lon / points.length };
}

export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    // (0, 0) is in the Gulf of Guinea and is overwhelmingly a "no fix" sentinel.
    !(lat === 0 && lon === 0)
  );
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function boundingBox(points: readonly LatLon[]): BoundingBox | null {
  if (points.length === 0) return null;
  const box: BoundingBox = { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 };
  for (const p of points) {
    if (p.lat < box.minLat) box.minLat = p.lat;
    if (p.lat > box.maxLat) box.maxLat = p.lat;
    if (p.lon < box.minLon) box.minLon = p.lon;
    if (p.lon > box.maxLon) box.maxLon = p.lon;
  }
  return box;
}

/** Offsets a coordinate by a distance in meters along each axis. Small-offset approximation. */
export function offsetMeters(origin: LatLon, northMeters: number, eastMeters: number): LatLon {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(toRadians(origin.lat));
  return {
    lat: origin.lat + northMeters / metersPerDegreeLat,
    lon: origin.lon + eastMeters / metersPerDegreeLon,
  };
}
