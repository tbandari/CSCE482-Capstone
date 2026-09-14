import { useCallback, useEffect, useState } from 'react';

import { subscribeToData } from '@/lib/db/events';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Runs an async store query, re-running it whenever the data layer reports a
 * change. `loading` is only true before the first result so screens never flash
 * their empty state during a refresh.
 */
export function useStoreQuery<T>(query: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => subscribeToData(reload), [reload]);

  useEffect(() => {
    let cancelled = false;
    query()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `query` is intentionally excluded: callers pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return { data, loading, error, reload };
}
