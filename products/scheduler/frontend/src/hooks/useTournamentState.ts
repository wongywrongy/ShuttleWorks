/**
 * Server-side persistence of the tournament state.
 *
 * On mount:
 *   1. GET /tournament/state
 *      - 200: hydrate Zustand from the returned payload
 *      - 204 (no file yet): read legacy `scheduler-storage` localStorage — if
 *        present, seed the server with it; otherwise keep Zustand defaults
 *
 * After hydration, subscribe to the tournament store and debounce a PUT
 * for 500 ms whenever a persisted field changes. A `hydrationDone` flag
 * prevents the first hydration setState from echoing back to the server.
 */
import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import type { TournamentStateDTO } from '../api/dto';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore } from '../store/uiStore';

const DEBOUNCE_MS = 500;
const LEGACY_KEY = 'scheduler-storage';

// Module-level timer so `forceSaveNow()` can flush from anywhere.
let moduleTimer: number | null = null;
let flushPromise: Promise<void> | null = null;

/** Cancel any pending debounced save and flush immediately. */
export async function forceSaveNow(): Promise<void> {
  if (moduleTimer !== null) {
    window.clearTimeout(moduleTimer);
    moduleTimer = null;
  }
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    const ui = useUiStore.getState();
    ui.setPersistStatus('saving');
    try {
      await apiClient.putTournamentState(snapshot(useTournamentStore.getState()));
      useUiStore.getState().setLastSavedAt(new Date().toISOString());
      useUiStore.getState().setLastSaveError(null);
      useUiStore.getState().setPersistStatus('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      useUiStore.getState().setLastSaveError(message);
      useUiStore.getState().setPersistStatus('error');
      throw err;
    } finally {
      flushPromise = null;
    }
  })();
  return flushPromise;
}

function snapshot(
  state: ReturnType<typeof useTournamentStore.getState>,
): TournamentStateDTO {
  // Schema v2 adds ``scheduleVersion`` + ``scheduleHistory`` for the
  // proposal pipeline. Both MUST be included in every PUT — without
  // them, Pydantic's default values (0 / []) overwrite the server's
  // value every time the operator edits a config field, wiping the
  // proposal-commit audit trail. ``scheduleStats`` is ephemeral (UI
  // store) and is not part of the persisted snapshot.
  return {
    version: 2,
    config: state.config,
    groups: state.groups,
    players: state.players,
    matches: state.matches,
    schedule: state.schedule,
    scheduleStats: null as unknown,
    scheduleIsStale: state.scheduleIsStale,
    scheduleVersion: state.scheduleVersion,
    scheduleHistory: state.scheduleHistory,
  };
}

function hydrate(s: TournamentStateDTO): void {
  // Direct setState (not the action setters) so we don't accidentally flip
  // scheduleIsStale=true during hydration.
  useTournamentStore.setState({
    config: s.config ?? null,
    groups: s.groups ?? [],
    players: s.players ?? [],
    matches: s.matches ?? [],
    schedule: s.schedule ?? null,
    scheduleIsStale: s.scheduleIsStale ?? false,
    // Schema v2 fields — server is the authority, default to clean
    // values when the file pre-dates the v2 migration.
    scheduleVersion: s.scheduleVersion ?? 0,
    scheduleHistory: s.scheduleHistory ?? [],
    // If the server has a committed schedule, the lock should be on
    // — otherwise the next config edit silently invalidates it
    // without prompting the unlock modal.
    isScheduleLocked: s.schedule != null,
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
      version: 2,
      config: legacy.config ?? null,
      groups: legacy.groups ?? [],
      players: legacy.players ?? [],
      matches: legacy.matches ?? [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
      scheduleVersion: 0,
      scheduleHistory: [],
    };
  } catch {
    return null;
  }
}

// Expose the stores on `window.__STORE__` so the Playwright e2e suite
// can read+seed app state without round-tripping through the UI. Module-
// scoped so it runs once at load time, not on every component render.
if (typeof window !== 'undefined') {
  (window as unknown as {
    __STORE__?: {
      tournament: typeof useTournamentStore;
      ui: typeof useUiStore;
    };
  }).__STORE__ = {
    tournament: useTournamentStore,
    ui: useUiStore,
  };
}

export function useTournamentState(): void {
  const hydrationDoneRef = useRef(false);

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
    const unsub = useTournamentStore.subscribe((state, prev) => {
      if (!hydrationDoneRef.current) return;
      const changed =
        state.config !== prev.config ||
        state.groups !== prev.groups ||
        state.players !== prev.players ||
        state.matches !== prev.matches ||
        state.schedule !== prev.schedule ||
        state.scheduleIsStale !== prev.scheduleIsStale;
      if (!changed) return;

      // Mark dirty immediately so the unsaved-changes UI can react before
      // the debounced flush fires.
      const ui = useUiStore.getState();
      if (ui.persistStatus !== 'saving') ui.setPersistStatus('dirty');

      if (moduleTimer !== null) window.clearTimeout(moduleTimer);
      moduleTimer = window.setTimeout(() => {
        moduleTimer = null;
        forceSaveNow().catch((err) => {
          console.error('[useTournamentState] put failed:', err);
        });
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      // Keep the module timer alive across unmount — the hook lives at the
      // shell level, so this cleanup only fires on full app teardown.
    };
  }, []);
}
