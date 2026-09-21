import { SAMPLE_PLACES } from '@/lib/demo/sample-week';
import { applyHidden, hiddenCategories } from '@/lib/profile/apply-hidden';
import { CATEGORIES, categoryInfo } from '@/lib/profile/categories';
import { sampleProfile } from '@/lib/profile/sample-profile';

const NOW = Date.UTC(2026, 8, 21, 17);

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('sampleProfile', () => {
  const profile = sampleProfile(NOW);

  test('weights of visible interests sum to 1 and are sorted', () => {
    expect(sum(profile.interests.map((i) => i.weight))).toBeCloseTo(1);
    const weights = profile.interests.map((i) => i.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  test('is consistent with itself and the sample week', () => {
    expect(profile.resolved_visits).toBeLessThanOrEqual(profile.total_visits);
    expect(sum(profile.interests.map((i) => i.visits))).toBe(profile.resolved_visits);
    const names = Object.values(SAMPLE_PLACES).map((p) => p.name);
    const interestCategories = profile.interests.map((i) => i.category);
    for (const place of profile.top_places) {
      if (place.name) expect(names).toContain(place.name);
      expect(interestCategories).toContain(place.category);
      expect(place.last_visit_ts).toBeLessThan(NOW);
    }
  });

  test('only uses known categories', () => {
    for (const c of [...profile.interests, ...profile.top_places]) {
      expect(Object.keys(CATEGORIES)).toContain(c.category);
    }
  });
});

describe('categoryInfo', () => {
  test('covers the whole backend vocabulary', () => {
    expect(Object.keys(CATEGORIES)).toEqual([
      'cafe', 'restaurant', 'fast_food', 'bar', 'library', 'university', 'school', 'gym', 'sports', 'park',
      'stadium', 'supermarket', 'convenience', 'shop', 'cinema', 'theatre', 'museum', 'worship', 'healthcare',
      'pharmacy', 'bank', 'fuel', 'parking', 'lodging', 'office', 'other',
    ]);
  });

  test('falls back for unknown categories, including prototype keys', () => {
    expect(categoryInfo('library').label).toBe('Libraries');
    expect(categoryInfo('casino')).toEqual(categoryInfo('other'));
    expect(categoryInfo('toString')).toEqual(categoryInfo('other'));
  });
});

describe('applyHidden', () => {
  const base = sampleProfile(NOW);

  test('with nothing hidden it returns the same interests', () => {
    expect(applyHidden(base, new Set())).toEqual(base);
  });

  test('hiding renormalises the rest, zeroes the hidden one and moves it last', () => {
    const result = applyHidden(base, new Set(['library']));
    const last = result.interests.at(-1)!;
    expect(last).toMatchObject({ category: 'library', hidden: true, weight: 0, visits: 9, dwell_minutes: 1260 });

    const visible = result.interests.filter((i) => !i.hidden);
    expect(sum(visible.map((i) => i.weight))).toBeCloseTo(1);
    const ratio = (r: typeof base, a: string, b: string) =>
      r.interests.find((i) => i.category === a)!.weight / r.interests.find((i) => i.category === b)!.weight;
    expect(ratio(result, 'gym', 'cafe')).toBeCloseTo(ratio(base, 'gym', 'cafe'));
  });

  test('places in hidden categories leave the top places', () => {
    const result = applyHidden(base, new Set(['library', 'cafe']));
    expect(result.top_places.map((p) => p.category)).not.toContain('library');
    expect(result.top_places.map((p) => p.category)).not.toContain('cafe');
    expect(result.top_places).toHaveLength(base.top_places.length - 2);
  });

  test('unhiding restores the original weights', () => {
    const hidden = applyHidden(base, new Set(['gym']));
    expect(hidden).not.toEqual(base);
    expect(applyHidden(base, new Set())).toEqual(base);
  });

  test('hiding everything leaves all weights at 0', () => {
    const all = new Set(base.interests.map((i) => i.category));
    const result = applyHidden(base, all);
    expect(result.interests.every((i) => i.hidden && i.weight === 0)).toBe(true);
    expect(hiddenCategories(result)).toEqual(all);
  });

  test('does not mutate its input', () => {
    const copy = structuredClone(base);
    applyHidden(base, new Set(['library']));
    expect(base).toEqual(copy);
  });
});
