/**
 * Server-side persistence of the tournament state.
 *
 * On mount:
 *   1. GET /tournament/state
 *      - 200: hydrate Zustand from the returned payload
 *      - 204 (no file yet): read legacy `scheduler-storage` localStorage — if
 *        present, seed the server with it; otherwise keep Zustand defaults
 *
 * After hydration, subscribe to Zustand and debounce a PUT for 500 ms
 * whenever a persisted field changes. A `hydrationDone` flag prevents
 * the first hydration setState from echoing back to the server.
 */
import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import type { TournamentStateDTO } from '../api/dto';
import { useAppStore } from '../store/appStore';

const DEBOUNCE_MS = 500;
const LEGACY_KEY = 'scheduler-storage';

function snapshot(state: ReturnType<typeof useAppStore.getState>): TournamentStateDTO {
  return {
    version: 1,
    config: state.config,
    groups: state.groups,
    players: state.players,
    matches: state.matches,
    schedule: state.schedule,
    scheduleStats: state.scheduleStats as unknown,
    scheduleIsStale: state.scheduleIsStale,
  };
}

function hydrate(s: TournamentStateDTO): void {
  // Direct setState (not the action setters) so we don't accidentally flip
  // scheduleIsStale=true during hydration.
  useAppStore.setState({
    config: s.config ?? null,
    groups: s.groups ?? [],
    players: s.players ?? [],
    matches: s.matches ?? [],
    schedule: s.schedule ?? null,
    scheduleStats: (s.scheduleStats as never) ?? null,
    scheduleIsStale: s.scheduleIsStale ?? false,
  });
}

function readLegacyLocalStorage(): TournamentStateDTO | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const legacy = parsed?.state;
    if (!legacy) return null;
    return {
      version: 1,
      config: legacy.config ?? null,
      groups: legacy.groups ?? [],
      players: legacy.players ?? [],
      matches: legacy.matches ?? [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    };
  } catch {
    return null;
  }
}

export function useTournamentState(): void {
  const hydrationDoneRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Expose the store on window for end-to-end tests (no-op in production; harmless).
  if (typeof window !== 'undefined') {
    (window as unknown as { __STORE__?: typeof useAppStore }).__STORE__ = useAppStore;
  }

  // ---- hydrate once on mount ------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await apiClient.getTournamentState();
        if (cancelled) return;
        if (remote) {
          hydrate(remote);
        } else {
          // No server state yet — migrate from legacy localStorage if any.
          const legacy = readLegacyLocalStorage();
          if (legacy) {
            hydrate(legacy);
            await apiClient.putTournamentState(legacy);
          }
        }
      } catch (err) {
        console.error('[useTournamentState] hydrate failed:', err);
      } finally {
        hydrationDoneRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- debounced PUT on any persisted-field change --------------------
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prev) => {
      if (!hydrationDoneRef.current) return;
      const changed =
        state.config !== prev.config ||
        state.groups !== prev.groups ||
        state.players !== prev.players ||
        state.matches !== prev.matches ||
        state.schedule !== prev.schedule ||
        state.scheduleStats !== prev.scheduleStats ||
        state.scheduleIsStale !== prev.scheduleIsStale;
      if (!changed) return;

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        apiClient
          .putTournamentState(snapshot(useAppStore.getState()))
          .catch((err) => console.error('[useTournamentState] put failed:', err));
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);
}
