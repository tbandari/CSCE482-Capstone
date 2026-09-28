import {
  applyFeedback,
  describeFeedback,
  formatProbability,
  undoFeedback,
} from '@/lib/recommendations/feedback';
import type { RecommendedPlace } from '@/lib/recommendations/types';

function place(id: number, name: string | null = `Place ${id}`): RecommendedPlace {
  return {
    place: { id, name, category: 'cafe', lat: 30.6, lon: -96.3 },
    score: 0.5,
    reason: 'matches your interest in cafés',
  };
}

const items = [place(1), place(2), place(3)];

describe('applyFeedback', () => {
  test('removes the row and remembers where it was', () => {
    const result = applyFeedback(items, 2, 'dismissed');
    expect(result.items.map((i) => i.place.id)).toEqual([1, 3]);
    expect(result.pending).toEqual({ item: items[1], index: 1, action: 'dismissed' });
  });

  test('an unknown place changes nothing', () => {
    const result = applyFeedback(items, 99, 'saved');
    expect(result.items.map((i) => i.place.id)).toEqual([1, 2, 3]);
    expect(result.pending).toBeNull();
  });

  test('does not mutate the list it is given', () => {
    const copy = structuredClone(items);
    applyFeedback(items, 1, 'saved');
    expect(items).toEqual(copy);
  });
});

describe('undoFeedback', () => {
  test('puts the row back in its old position', () => {
    const { items: after, pending } = applyFeedback(items, 2, 'dismissed');
    expect(undoFeedback(after, pending).map((i) => i.place.id)).toEqual([1, 2, 3]);
  });

  test('restores the first and last rows correctly', () => {
    for (const id of [1, 3]) {
      const { items: after, pending } = applyFeedback(items, id, 'saved');
      expect(undoFeedback(after, pending).map((i) => i.place.id)).toEqual([1, 2, 3]);
    }
  });

  test('appends rather than throwing when the list shrank underneath it', () => {
    const { pending } = applyFeedback(items, 3, 'dismissed');
    expect(undoFeedback([], pending).map((i) => i.place.id)).toEqual([3]);
  });

  test('nothing pending is a no-op', () => {
    expect(undoFeedback(items, null).map((i) => i.place.id)).toEqual([1, 2, 3]);
  });
});

describe('describeFeedback', () => {
  test('names the place and the action, including unnamed places', () => {
    const dismissed = applyFeedback(items, 1, 'dismissed').pending!;
    expect(describeFeedback(dismissed)).toBe('Dismissed Place 1.');
    const saved = applyFeedback([place(4, null)], 4, 'saved').pending!;
    expect(describeFeedback(saved)).toBe('Saved Unnamed place.');
  });
});

describe('formatProbability', () => {
  test('renders whole percentages and clamps nonsense', () => {
    expect(formatProbability(0.413)).toBe('41%');
    expect(formatProbability(0)).toBe('0%');
    expect(formatProbability(1)).toBe('100%');
    expect(formatProbability(1.5)).toBe('100%');
    expect(formatProbability(-0.2)).toBe('0%');
  });
});
