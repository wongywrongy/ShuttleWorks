import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { TournamentDTO } from "../types";

const POLL_MS = 2500;

export function useTournament() {
  const [data, setDataInner] = useState<TournamentDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Both ``refresh`` completions and external ``setData`` calls bump
  // this so the poll only fires when the data is at least POLL_MS
  // stale. Without it, a poll that started before a user action
  // resolves can clobber the fresher DTO returned by that action.
  const lastTouched = useRef(0);

  const setData = useCallback((next: TournamentDTO | null) => {
    lastTouched.current = Date.now();
    setDataInner(next);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const d = await api.get();
      lastTouched.current = Date.now();
      setDataInner(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("404")) {
        lastTouched.current = Date.now();
        setDataInner(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (Date.now() - lastTouched.current >= POLL_MS - 100) refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, setData, loading, error, refresh };
}
