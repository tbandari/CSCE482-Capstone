import { useCallback, useMemo, useState } from 'react';

import { applyHidden, hiddenCategories } from '@/lib/profile/apply-hidden';
import { sampleProfile } from '@/lib/profile/sample-profile';
import type { InterestProfile } from '@/lib/profile/types';

export interface InterestProfileState {
  profile: InterestProfile | null;
  loading: boolean;
  error: string | null;
  /** True while the profile is the built-in sample rather than the user's own. */
  isSample: boolean;
  setHidden: (category: string, hidden: boolean) => void;
}

/**
 * The user's interest profile. Until the app signs in and syncs, this is the
 * sample profile, and hiding interests only changes local state.
 */
export function useInterestProfile(): InterestProfileState {
  // TODO(part-2): when signed in, load `GET /profile` (via src/lib/api) instead of the sample,
  // and re-run it when sync reports new data.
  const [base] = useState(() => sampleProfile());
  const [hidden, setHiddenSet] = useState<ReadonlySet<string>>(() => hiddenCategories(base));

  const setHidden = useCallback((category: string, value: boolean) => {
    // TODO(part-2): `PATCH /profile/interests/{category}` with `{ hidden: value }`, then adopt the
    // profile it returns as the new base (keep this optimistic update while the request runs).
    setHiddenSet((current) => {
      const next = new Set(current);
      if (value) next.add(category);
      else next.delete(category);
      return next;
    });
  }, []);

  const profile = useMemo(() => applyHidden(base, hidden), [base, hidden]);
  return { profile, loading: false, error: null, isSample: true, setHidden };
}
