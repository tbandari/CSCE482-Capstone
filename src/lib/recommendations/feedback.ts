/**
 * Saving or dismissing a suggestion, applied on screen before the server has
 * agreed. The row leaves immediately and the last action is kept so Undo can put
 * it back where it was — including when the request fails.
 */

import type { FeedbackAction, RecommendedPlace } from '@/lib/recommendations/types';

export interface PendingFeedback {
  item: RecommendedPlace;
  /** Where the row was, so Undo restores the order rather than appending. */
  index: number;
  action: FeedbackAction;
}

export function applyFeedback(
  items: readonly RecommendedPlace[],
  placeId: number,
  action: FeedbackAction,
): { items: RecommendedPlace[]; pending: PendingFeedback | null } {
  const index = items.findIndex((item) => item.place.id === placeId);
  if (index === -1) return { items: [...items], pending: null };
  return {
    items: items.filter((_, i) => i !== index),
    pending: { item: items[index], index, action },
  };
}

export function undoFeedback(
  items: readonly RecommendedPlace[],
  pending: PendingFeedback | null,
): RecommendedPlace[] {
  if (!pending) return [...items];
  const restored = [...items];
  restored.splice(Math.min(pending.index, restored.length), 0, pending.item);
  return restored;
}

export function describeFeedback(pending: PendingFeedback): string {
  const name = pending.item.place.name ?? 'Unnamed place';
  return pending.action === 'dismissed' ? `Dismissed ${name}.` : `Saved ${name}.`;
}

/** "41%" — a probability as a whole percentage. */
export function formatProbability(probability: number): string {
  return `${Math.round(Math.min(1, Math.max(0, probability)) * 100)}%`;
}
