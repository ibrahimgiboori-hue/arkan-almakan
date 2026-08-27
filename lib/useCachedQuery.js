'use client';

/**
 * Shared stale-while-revalidate helper for ordinary dashboard reads.
 *
 * Opt-in only: do not use it for approval decisions or other screens where a
 * user must always see freshly fetched state before acting. Cached entries live
 * only in the current browser tab and disappear on a full reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const cache = new Map(); // key -> { data, ts }
const DEFAULT_STALE_MS = 15000;

export function useCachedQuery(key, fetcher, { staleMs = DEFAULT_STALE_MS } = {}) {
  const fetcherRef = useRef(fetcher);
  const requestRef = useRef(0);
  fetcherRef.current = fetcher;

  const first = key ? cache.get(key) : null;
  const [state, setState] = useState({
    key,
    data: first?.data ?? null,
    loading: Boolean(key) && !first,
    error: null,
  });

  const load = useCallback(async ({ force = false } = {}) => {
    if (!key) {
      setState({ key:null, data:null, loading:false, error:null });
      return undefined;
    }

    const requestId = ++requestRef.current;
    const entry = cache.get(key);

    if (entry) {
      setState({ key, data:entry.data, loading:false, error:null });
      const isFresh = Date.now() - entry.ts < staleMs;
      if (isFresh && !force) return entry.data;
    } else {
      setState({ key, data:null, loading:true, error:null });
    }

    try {
      const data = await fetcherRef.current();
      if (requestId !== requestRef.current) return data;
      cache.set(key, { data, ts:Date.now() });
      setState({ key, data, loading:false, error:null });
      return data;
    } catch (error) {
      if (requestId === requestRef.current) {
        setState((current) => ({
          key,
          data: current.key === key ? current.data : (entry?.data ?? null),
          loading:false,
          error,
        }));
      }
      return undefined;
    }
  }, [key, staleMs]);

  useEffect(() => {
    requestRef.current += 1; // invalidate any request that belonged to the old key
    const entry = key ? cache.get(key) : null;
    setState({ key, data:entry?.data ?? null, loading:Boolean(key) && !entry, error:null });
    load();
    // load already tracks key/staleMs; fetcher is intentionally read from a ref.
  }, [key, load]);

  const visibleState = state.key === key
    ? state
    : { key, data:first?.data ?? null, loading:Boolean(key) && !first, error:null };

  return { ...visibleState, reload: () => load({ force:true }) };
}

/** Invalidate one cached key, or every key sharing a prefix, after a write. */
export function invalidateCachedQuery(keyOrPrefix) {
  if (!keyOrPrefix) return;
  if (cache.has(keyOrPrefix)) {
    cache.delete(keyOrPrefix);
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(keyOrPrefix)) cache.delete(key);
  }
}
