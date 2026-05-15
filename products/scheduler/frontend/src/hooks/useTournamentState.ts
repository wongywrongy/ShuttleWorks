/**
 * Server-side persistence of a single tournament's state.
 *
 * Mounted inside ``TournamentPage`` at ``/tournaments/:id/*``. On mount:
 *   1. GET /tournaments/{id}/state
 *      - 200 → hydrate Zustand from the returned payload
 *      - 204 → no state yet; Zustand keeps its defaults
 *   2. Stamp ``ui.activeTournamentId`` so ``forceSaveNow`` knows which
 *      tournament to PUT against.
 *
 * After hydration, subscribe to the tournament store and debounce a PUT
 * for 500 ms whenever a persisted field changes. A ``hydrationDone``
 * flag prevents the first hydration setState from echoing back to the
 * server.
 *
 * Step 2 retired the legacy ``scheduler-storage`` localStorage
 * migration — tournament data has been server-side since pre-Step-1.
 */
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { TournamentStateDTO } from '../api/dto';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore } from '../store/uiStore';

const DEBOUNCE_MS = 500;

// Module-level timer so `forceSaveNow()` can flush from anywhere.
let moduleTimer: number | null = null;
let flushPromise: Promise<void> | null = null;
// Set to true by the subscribe handler when state changes WHILE a PUT is
// in flight.  The in-flight finally-block checks this and re-arms the
// debounce so the dirty changes get a follow-up save.  Reset to false at
// the START of every flush (not the end) so a concurrent change after
// the snapshot is taken but before the PUT resolves is still captured.
let pendingFollowup = false;

/** Cancel any pending debounced save and flush immediately.
 *
 * Reads the active tournament id from ``useUiStore`` (set by
 * ``TournamentPage`` on mount). No-ops when no tournament is active —
 * the public display and the tournament-list page have nothing to save.
 *
 * Race-safety: if a PUT is already in flight when this is called we
 * record a follow-up flag and return the in-flight promise.  The
 * finally-block of the in-flight PUT re-arms the debounce timer if the
 * flag is set, guaranteeing that any state changes made during the
 * in-flight PUT are not silently dropped.
 */
export async function forceSaveNow(): Promise<void> {
  if (moduleTimer !== null) {
    window.clearTimeout(moduleTimer);
    moduleTimer = null;
  }
  if (flushPromise) {
    // A PUT is already in flight.  Signal that a follow-up is needed so
    // the in-flight finally-block re-arms the debounce when it lands.
    pendingFollowup = true;
    return flushPromise;
  }
  const tid = useUiStore.getState().activeTournamentId;
  if (!tid) return;
  // Reset the followup flag BEFORE taking the snapshot so any concurrent
  // mutation that arrives after the snapshot triggers another save.
  pendingFollowup = false;
  flushPromise = (async () => {
    const ui = useUiStore.getState();
    ui.setPersistStatus('saving');
    try {
      await apiClient.putTournamentState(tid, snapshot(useTournamentStore.getState()));
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
      // If state changed during the in-flight PUT, re-arm the debounce
      // so the dirty changes are not silently dropped.
      if (pendingFollowup) {
        pendingFollowup = false;
        if (moduleTimer === null) {
          moduleTimer = window.setTimeout(() => {
            moduleTimer = null;
            forceSaveNow().catch((err) => {
              console.error('[useTournamentState] followup put failed:', err);
            });
          }, DEBOUNCE_MS);
        }
      }
    }
  })();
  return flushPromise;
}

/** Exposed for unit tests only — resets all module-level save state. */
export function _resetSaveStateForTests(): void {
  if (moduleTimer !== null) {
    window.clearTimeout(moduleTimer);
    moduleTimer = null;
  }
  flushPromise = null;
  pendingFollowup = false;
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
    bracketPlayers: state.bracketPlayers,
    bracketRosterMigrated: state.bracketRosterMigrated,
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
    // Bracket roster fields — empty for meet-kind; populated by bracket
    // roster hydration from ``bracket_participants`` on first load.
    bracketPlayers: s.bracketPlayers ?? [],
    bracketRosterMigrated: s.bracketRosterMigrated ?? false,
  });
}

function resetToDefaults(): void {
  useTournamentStore.setState({
    config: null,
    groups: [],
    players: [],
    matches: [],
    schedule: null,
    scheduleIsStale: false,
    scheduleVersion: 0,
    scheduleHistory: [],
    isScheduleLocked: false,
    bracketPlayers: [],
    bracketRosterMigrated: false,
  });
}

// Expose the stores on `window.__STORE__` so the Playwright e2e suite
// can read+seed app state without round-tripping through the UI.
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
  const params = useParams<{ id?: string }>();
  const tid = params.id ?? null;
  const hydrationDoneRef = useRef(false);

  // ---- hydrate once per tournament change ------------------------------
  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    hydrationDoneRef.current = false;
    useUiStore.getState().setActiveTournamentId(tid);
    (async () => {
      try {
        const remote = await apiClient.getTournamentState(tid);
        if (cancelled) return;
        if (remote) {
          hydrate(remote);
        } else {
          // No state yet for this tournament — reset Zustand to defaults
          // so leftover state from a previously-viewed tournament doesn't
          // leak in.
          resetToDefaults();
        }
      } catch (err) {
        console.error('[useTournamentState] hydrate failed:', err);
      } finally {
        hydrationDoneRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
      // Flush any pending debounced PUT before the tournament changes.
      void forceSaveNow().catch(() => {});
      useUiStore.getState().setActiveTournamentId(null);
    };
  }, [tid]);

  // ---- debounced PUT on any persisted-field change --------------------
  useEffect(() => {
    if (!tid) return;
    const unsub = useTournamentStore.subscribe((state, prev) => {
      if (!hydrationDoneRef.current) return;
      const changed =
        state.config !== prev.config ||
        state.groups !== prev.groups ||
        state.players !== prev.players ||
        state.matches !== prev.matches ||
        state.schedule !== prev.schedule ||
        state.scheduleIsStale !== prev.scheduleIsStale ||
        state.bracketPlayers !== prev.bracketPlayers ||
        state.bracketRosterMigrated !== prev.bracketRosterMigrated;
      if (!changed) return;

      // Mark dirty immediately so the unsaved-changes UI can react before
      // the debounced flush fires.
      const ui = useUiStore.getState();
      if (ui.persistStatus !== 'saving') ui.setPersistStatus('dirty');

      // If a PUT is already in flight, record that state changed so the
      // in-flight finally-block knows to re-save after it lands.
      if (flushPromise !== null) {
        pendingFollowup = true;
        return;
      }

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
    };
  }, [tid]);
}
