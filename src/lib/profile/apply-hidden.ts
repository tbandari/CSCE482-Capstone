/**
 * Hiding an interest, computed locally so the Profile tab responds instantly.
 *
 * It works from the base profile (as the server sent it) plus the set of hidden
 * categories, not from the previous result, because a hidden interest's weight
 * is 0: unhiding it needs the original share back. This mirrors the server:
 * hidden interests keep their counts, get weight 0 and sort last, the rest are
 * renormalised, and places in hidden categories drop out of the top places.
 */

import type { InterestProfile } from '@/lib/profile/types';

export function applyHidden(base: InterestProfile, hidden: ReadonlySet<string>): InterestProfile {
  const isHidden = (category: string) => hidden.has(category);
  const visibleTotal = base.interests
    .filter((i) => !isHidden(i.category))
    .reduce((sum, i) => sum + i.weight, 0);

  const interests = base.interests
    .map((i) => ({
      ...i,
      hidden: isHidden(i.category),
      weight: isHidden(i.category) || visibleTotal === 0 ? 0 : i.weight / visibleTotal,
    }))
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || b.weight - a.weight || a.category.localeCompare(b.category));

  return {
    ...base,
    interests,
    top_places: base.top_places.filter((p) => !isHidden(p.category)),
  };
}

/** The categories the server already reports as hidden. */
export function hiddenCategories(profile: InterestProfile): Set<string> {
  return new Set(profile.interests.filter((i) => i.hidden).map((i) => i.category));
}
