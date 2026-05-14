/**
 * Bracket polling hook — adapted from the tournament product's
 * ``useTournament``. Polls ``GET /tournaments/{tid}/bracket`` every
 * ``POLL_MS`` and exposes the same ``{ data, setData, loading,
 * error, refresh }`` shape the ported bracket components expect.
 *
 * Realtime subscription via Supabase ``postgres_changes`` is a
 * deliberate follow-up — PR 2 added the bracket_* tables to the
 * Realtime publication, but switching the bracket UI from polling
 * to subscriptions ships in a later PR alongside ``commandQueue``
 * integration for bracket actions.
 *
 * Lives inside the ``BracketApiProvider`` mounted by ``BracketTab``.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBracketApi } from '../api/bracketClient';
import type { BracketTournamentDTO } from '../api/bracketDto';

const POLL_MS = 2500;

export function useBracket() {
  const api = useBracketApi();
  const [data, setDataInner] = useState<BracketTournamentDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Both ``refresh`` completions and external ``setData`` calls bump
  // this so the poll only fires when the data is at least POLL_MS
  // stale. Without it, a poll that started before a user action
  // resolves can clobber the fresher DTO returned by that action.
  const lastTouched = useRef(0);

  const setData = useCallback((next: BracketTournamentDTO | null) => {
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
      // 404 is the "no bracket configured yet" signal — keep ``data``
      // null and let the UI render the SetupForm rather than treating
      // it as an error.
      if (msg.includes('404')) {
        lastTouched.current = Date.now();
        setDataInner(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (Date.now() - lastTouched.current >= POLL_MS - 100) refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, setData, loading, error, refresh };
}
