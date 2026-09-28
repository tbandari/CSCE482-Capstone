import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/lib/api/session';
import { describeError } from '@/lib/describe-error';
import { fetchProfile, patchInterestHidden } from '@/lib/profile/api';
import { applyHidden, hiddenCategories } from '@/lib/profile/apply-hidden';
import { sampleProfile } from '@/lib/profile/sample-profile';
import type { InterestProfile } from '@/lib/profile/types';

export interface InterestProfileState {
  profile: InterestProfile | null;
  loading: boolean;
  /** Set when the last request failed; the profile on screen is then stale. */
  error: string | null;
  /** True while the profile is the built-in sample rather than the user's own. */
  isSample: boolean;
  setHidden: (category: string, hidden: boolean) => void;
  reload: () => void;
}

/**
 * The user's interest profile: live from `GET /profile` when signed in, and the
 * built-in sample when signed out, so the tab is never empty.
 *
 * Hiding a category applies locally first and is sent to the server behind it. A
 * failed request rolls the change back rather than leaving the screen showing
 * something the server didn't accept.
 */
export function useInterestProfile(): InterestProfileState {
  const session = useSession();
  const token = session.token;
  const [sample] = useState(() => sampleProfile());
  const [fetched, setFetched] = useState<InterestProfile | null>(null);
  const [hiddenOverride, setHiddenOverride] = useState<ReadonlySet<string> | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Signed out, the sample stands in. Both this and `loading` are derived during
  // render rather than written from an effect, which would cost an extra pass.
  const base = token ? fetched : sample;
  const key = token && session.ready ? `${token}:${version}` : null;
  const loading = key != null && loadedKey !== key && fetched == null;

  const hidden = useMemo(
    () => hiddenOverride ?? (base ? hiddenCategories(base) : new Set<string>()),
    [hiddenOverride, base],
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const adopt = useCallback((profile: InterestProfile) => {
    setFetched(profile);
    setHiddenOverride(hiddenCategories(profile));
  }, []);

  useEffect(() => {
    if (key == null || token == null) return undefined;
    let cancelled = false;
    fetchProfile(token)
      .then((profile) => {
        if (cancelled) return;
        adopt(profile);
        setError(null);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(describeError(failure));
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [key, token, adopt]);

  const setHidden = useCallback(
    (category: string, value: boolean) => {
      const previous = hidden;
      const next = new Set(previous);
      if (value) next.add(category);
      else next.delete(category);
      setHiddenOverride(next);
      if (!token) return; // signed out: the sample profile is local only

      patchInterestHidden(token, category, value)
        .then((profile) => {
          adopt(profile);
          setError(null);
        })
        .catch((failure: unknown) => {
          setHiddenOverride(previous);
          setError(describeError(failure));
        });
    },
    [hidden, token, adopt],
  );

  const profile = useMemo(() => (base ? applyHidden(base, hidden) : null), [base, hidden]);
  return { profile, loading, error, isSample: token == null, setHidden, reload };
}
