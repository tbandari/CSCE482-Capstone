/**
 * How a visit is named on screen.
 *
 * A visit gets a resolved place from the server, an older user label, or
 * nothing at all, and every screen has to make the same choice between them.
 */

import { formatCoordinates } from '@/lib/format';
import type { Visit } from '@/lib/types';

/** The visit's place name, or null when it has none yet. */
export function visitPlaceName(visit: Pick<Visit, 'placeName' | 'label'>): string | null {
  return visit.placeName?.trim() || visit.label?.trim() || null;
}

/** What to show as the visit's title: its place name, else its coordinates. */
export function visitTitle(visit: Pick<Visit, 'placeName' | 'label' | 'lat' | 'lon'>): string {
  return visitPlaceName(visit) ?? formatCoordinates(visit.lat, visit.lon);
}

/** The visit's place category, or null when unresolved. */
export function visitCategory(visit: Pick<Visit, 'placeCategory'>): string | null {
  return visit.placeCategory?.trim() || null;
}
