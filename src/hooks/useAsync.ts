import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/supabase';

/** Load data with loading/error state and a reload function. Ignores results from stale calls. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const callId = useRef(0);

  const run = useCallback(async () => {
    const id = ++callId.current;
    setLoading(true); setError(null);
    try {
      const v = await fn();
      if (id === callId.current) setData(v);
    } catch (e) {
      if (id === callId.current) setError(errorMessage(e));
    } finally {
      if (id === callId.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run(); }, [run]);
  return { data, loading, error, reload: run, setData };
}
