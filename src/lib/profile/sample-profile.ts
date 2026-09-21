/**
 * A realistic interest profile for a Texas A&M student, built around the same
 * places as the sample week (lib/demo/sample-week.ts), so the Profile tab has
 * something to show before sign-in and sync. The shape is exactly `GET /profile`.
 */

import { SAMPLE_PLACES } from '@/lib/demo/sample-week';
import type { InterestProfile } from '@/lib/profile/types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function sampleProfile(now = Date.now()): InterestProfile {
  return {
    generated_at: now,
    total_visits: 48,
    // Home isn't an OSM place, so its visits stay unresolved.
    resolved_visits: 38,
    interests: [
      { category: 'library', weight: 0.33, visits: 9, dwell_minutes: 1260, hidden: false },
      { category: 'university', weight: 0.26, visits: 10, dwell_minutes: 1080, hidden: false },
      { category: 'gym', weight: 0.13, visits: 5, dwell_minutes: 360, hidden: false },
      { category: 'cafe', weight: 0.12, visits: 6, dwell_minutes: 270, hidden: false },
      { category: 'stadium', weight: 0.08, visits: 2, dwell_minutes: 420, hidden: false },
      { category: 'supermarket', weight: 0.05, visits: 4, dwell_minutes: 120, hidden: false },
      { category: 'fast_food', weight: 0.03, visits: 2, dwell_minutes: 35, hidden: false },
    ],
    top_places: [
      { place_id: 2, name: SAMPLE_PLACES.zachry.name, category: 'university', visits: 10, last_visit_ts: now - 1 * DAY },
      { place_id: 3, name: SAMPLE_PLACES.library.name, category: 'library', visits: 9, last_visit_ts: now - 2 * DAY },
      { place_id: 6, name: SAMPLE_PLACES.coffee.name, category: 'cafe', visits: 6, last_visit_ts: now - 1 * DAY - 3 * HOUR },
      { place_id: 4, name: SAMPLE_PLACES.rec.name, category: 'gym', visits: 5, last_visit_ts: now - 3 * DAY },
      { place_id: 5, name: SAMPLE_PLACES.grocery.name, category: 'supermarket', visits: 4, last_visit_ts: now - 5 * DAY },
      { place_id: 7, name: SAMPLE_PLACES.kyle.name, category: 'stadium', visits: 2, last_visit_ts: now - 6 * DAY },
      { place_id: 8, name: null, category: 'fast_food', visits: 2, last_visit_ts: now - 4 * DAY },
    ],
  };
}
