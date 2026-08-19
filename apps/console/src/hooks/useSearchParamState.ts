/**
 * URL-backed local state. Reads/writes a single ``searchParams`` key
 * with debounced replace-state semantics — so a fast typist doesn't
 * flood the history stack with intermediate query strings.
 *
 * Used by the inline search/filter widgets on Roster / Matches /
 * Schedule. Keeping filter state in the URL means an operator can
 * paste "the view I'm looking at right now" into chat and a teammate
 * sees the same set of rows.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

interface UseSearchParamStateOptions {
  /** Debounce delay before pushing to the URL. Defaults to 250ms — fast
   *  enough to feel live, slow enough to coalesce keystrokes. */
  debounceMs?: number;
}

export function useSearchParamState(
  key: string,
  initial = '',
  { debounceMs = 250 }: UseSearchParamStateOptions = {},
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();

  // Local state mirrors the URL so the component re-renders on every
  // keystroke without waiting for the debounced URL flush.
  const [value, setLocal] = useState(() => params.get(key) ?? initial);

  // External URL changes (back/forward, deep-link paste, programmatic
  // setParams from elsewhere) flow into local state.
  useEffect(() => {
    const fromUrl = params.get(key) ?? initial;
    if (fromUrl !== value) setLocal(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, key]);

  // Debounced URL flush: schedule on every change, cancel previous.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === '' || value === initial) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [value, key, initial, debounceMs, setParams]);

  const set = useCallback((next: string) => setLocal(next), []);
  return [value, set];
}

/**
 * Like ``useSearchParamState`` but for a comma-separated set of values
 * (filter chips). Round-trips ``?event=MS,WS`` ↔ ``Set { 'MS', 'WS' }``.
 */
export function useSearchParamSet(
  key: string,
  { debounceMs = 0 }: UseSearchParamStateOptions = {},
): [Set<string>, (next: Set<string>) => void, (value: string) => void] {
  const [raw, setRaw] = useSearchParamState(key, '', { debounceMs });

  const set = new Set<string>(raw ? raw.split(',').filter(Boolean) : []);
  const replace = useCallback(
    (next: Set<string>) => {
      const arr = Array.from(next).sort();
      setRaw(arr.join(','));
    },
    [setRaw],
  );
  const toggle = useCallback(
    (value: string) => {
      const arr = raw ? raw.split(',').filter(Boolean) : [];
      const has = arr.includes(value);
      const next = has ? arr.filter((v) => v !== value) : [...arr, value];
      setRaw(next.sort().join(','));
    },
    [raw, setRaw],
  );

  return [set, replace, toggle];
}
