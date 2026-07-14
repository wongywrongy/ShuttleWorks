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
import { assertCanEdit } from './useCanEdit';

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
// Armed by useLockGuard's confirm: the next PUT carries ?clearSchedule=true
// so the SERVER clears the committed schedule(s) — including the bracket's,
// which lives in a server-managed blob the client cannot null out itself.
let clearScheduleNext = false;

/** One-shot: the next flushed PUT sanctions a scheduling-field edit. */
export function requestClearScheduleOnNextSave(): void {
  clearScheduleNext = true;
}

/**
 * Shared error-bookkeeping for a rejected save: sets the error banner,
 * and for a 409 (the server rejected the CONTENT, not our version)
 * re-syncs from the server and toasts. A network error / 5xx is
 * transient and retryable, so it must keep the operator's unsaved work
 * — only a 409 re-hydrates.
 *
 * DRAW_STARTED (the absolute schedule lock — a draw in play) gets a
 * distinct, non-actionable message: there is no clear-and-retry to
 * offer for it, unlike CONFIG_LOCKED which the caller handles with a
 * confirm-and-retry BEFORE reaching here (see the 409 branch in
 * `forceSaveNow`, which only falls through to this helper once no
 * clear-schedule retry applies).
 */
async function handleRejectedSave(tid: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : 'Save failed';
  useUiStore.getState().setLastSaveError(message);
  useUiStore.getState().setPersistStatus('error');

  const status = (err as { response?: { status?: number }; status?: number })
    ?.response?.status ?? (err as { status?: number })?.status;
  if (status !== 409) return;

  const code = (err as { code?: string })?.code;
  try {
    const remote = await apiClient.getTournamentState(tid);
    if (remote) hydrate(remote);
    useUiStore.getState().setPersistStatus('idle');
    if (code === 'DRAW_STARTED') {
      useUiStore.getState().pushToast({
        level: 'warn',
        message: "A started draw locks the schedule",
        detail:
          "It can't be cleared while a draw is in play — the workspace has been re-synced to the server.",
        durationMs: 6000,
      });
    } else {
      useUiStore.getState().pushToast({
        level: 'warn',
        message: 'That change was rejected',
        detail: `${message} — the workspace has been re-synced to the server.`,
        durationMs: 6000,
      });
    }
  } catch {
    // Re-sync failed (transient). Leave the error status standing: the
    // store still holds the rejected edit, and the banner says so.
  }
}

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
  // A viewer may not write (audit A2). This is the single funnel for every
  // blob write — roster, matches, config, schedule — so refusing here means a
  // viewer's edit never reaches the wire, instead of 403-ing and leaving the
  // local store diverged from the server.
  if (!assertCanEdit()) return;
  // Reset the followup flag BEFORE taking the snapshot so any concurrent
  // mutation that arrives after the snapshot triggers another save.
  pendingFollowup = false;
  const clearSchedule = clearScheduleNext;
  clearScheduleNext = false;
  flushPromise = (async () => {
    const ui = useUiStore.getState();
    ui.setPersistStatus('saving');
    const payload = snapshot(useTournamentStore.getState());
    try {
      // Only the sanctioned path passes options — an ordinary save keeps the
      // plain two-argument call it has always made.
      if (clearSchedule) {
        await apiClient.putTournamentState(tid, payload, { clearSchedule: true });
      } else {
        await apiClient.putTournamentState(tid, payload);
      }
      useUiStore.getState().setLastSavedAt(new Date().toISOString());
      useUiStore.getState().setLastSaveError(null);
      useUiStore.getState().setPersistStatus('idle');
    } catch (err) {
      const status = (err as { response?: { status?: number }; status?: number })
        ?.response?.status ?? (err as { status?: number })?.status;
      const code = (err as { code?: string })?.code;

      // ── 409 CONFIG_LOCKED, no clearSchedule opt-in yet: REACT to the
      // backend's lock instead of trusting a per-module proactive guess.
      // The engine config is shared and gated by ONE backend lock that
      // fires when EITHER module (meet or bracket) has a committed
      // schedule with assignments — a per-module guard (isScheduleLocked /
      // bracketHasSchedule) only ever sees its OWN module's schedule, so it
      // misses the cross-module case (e.g. editing meet's Engine tab while
      // only the bracket has a committed schedule). This branch is the
      // backstop: it fires the same confirm-unlock modal the proactive
      // guards use, and on confirm retries the exact same PUT with
      // `?clearSchedule=true`. On decline, the edit is abandoned cleanly
      // (re-hydrate) with no raw backend string in the toast.
      if (status === 409 && code === 'CONFIG_LOCKED' && !clearSchedule) {
        const confirmed = await new Promise<boolean>((resolve) => {
          useUiStore.getState().setUnlockModalState({
            open: true,
            // UnlockModal templates this as "{actionDescription} will clear
            // the currently committed schedule…" — keep it a short phrase
            // like the other callers ('save engine settings'), not a full
            // sentence, or the copy comes out doubled/ungrammatical.
            actionDescription: 'This edit',
            resolve: (ok: boolean) => {
              useUiStore.getState().setUnlockModalState(null);
              resolve(ok);
            },
          });
        });
        if (confirmed) {
          useTournamentStore.getState().unlockSchedule();
          try {
            await apiClient.putTournamentState(tid, payload, { clearSchedule: true });
            useUiStore.getState().setLastSavedAt(new Date().toISOString());
            useUiStore.getState().setLastSaveError(null);
            useUiStore.getState().setPersistStatus('idle');
            return;
          } catch (retryErr) {
            await handleRejectedSave(tid, retryErr);
            throw retryErr;
          }
        }
        // Declined: abandon the edit cleanly. Re-sync from the server so
        // the store holds a blob it will accept next time, but skip the
        // generic "rejected" toast — the operator just said no, that's not
        // a surprise worth a warning banner.
        try {
          const remote = await apiClient.getTournamentState(tid);
          if (remote) hydrate(remote);
        } catch {
          // Re-sync failed (transient) — leave the store as-is.
        }
        useUiStore.getState().setLastSaveError(null);
        useUiStore.getState().setPersistStatus('idle');
        return;
      }

      await handleRejectedSave(tid, err);
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
  clearScheduleNext = false;
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
    // SP-G1: must be included in every PUT so a config-field save does not
    // reset planFinalized to false via Pydantic's default. Mirror of the
    // scheduleVersion/scheduleHistory pattern (Task 17).
    planFinalized: state.planFinalized ?? false,
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
    // Task 9: server-computed Meet pool standings (Task 2). Read-only —
    // deliberately NOT part of `snapshot()` below or the subscribe
    // change-comparator: it's server-derived, never client-writable, so
    // including it there would round-trip a phantom PUT on every hydrate.
    standings: s.standings ?? [],
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
    // SP-G1: plan-finalized read (setter + snapshot wired in Task 17).
    planFinalized: s.planFinalized ?? false,
  });
}

function resetToDefaults(): void {
  useTournamentStore.setState({
    config: null,
    groups: [],
    players: [],
    matches: [],
    schedule: null,
    standings: [],
    scheduleIsStale: false,
    scheduleVersion: 0,
    scheduleHistory: [],
    isScheduleLocked: false,
    bracketPlayers: [],
    bracketRosterMigrated: false,
    planFinalized: undefined,
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
        state.bracketRosterMigrated !== prev.bracketRosterMigrated ||
        // SP-G1: planFinalized toggle (Task 17). The toggle also calls the
        // dedicated POST endpoint; this ensures the full snapshot (which now
        // includes planFinalized) round-trips even if changed via other paths.
        state.planFinalized !== prev.planFinalized;
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
