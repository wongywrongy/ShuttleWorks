/**
 * Unit tests for the forceSaveNow race-safety fix in useTournamentState.
 *
 * Bug: when a PUT was in flight and state changed, the dirty edits were
 * silently dropped — forceSaveNow returned the in-flight promise and the
 * subscribe handler never queued a follow-up save.
 *
 * Fix: a `pendingFollowup` flag is set when state changes during an
 * in-flight PUT.  The finally-block of the in-flight PUT re-arms the
 * debounce timer if the flag is set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceSaveNow, _resetSaveStateForTests } from '../../hooks/useTournamentState';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import * as clientModule from '../../api/client';
import type { PlayerDTO } from '../../api/dto';

// ---- Helpers -----------------------------------------------------------

function makePut() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---- Setup / teardown --------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  _resetSaveStateForTests();
  // Arm the active tournament id AND an authorized role so forceSaveNow doesn't
  // short-circuit. The write gate (audit A2) fails closed on an unknown role —
  // these tests exercise save mechanics, so the caller must be able to save.
  useUiStore.setState({
    activeTournamentId: 'test-tournament-1',
    activeTournamentRole: 'owner',
  });
  // Seed a minimal config so the snapshot is valid.
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      courtCount: 4,
      restBetweenRounds: 1,
      breaks: [],
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      tournamentName: 'Initial Name',
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  _resetSaveStateForTests();
  useUiStore.setState({ activeTournamentId: null });
});

// ---- Tests -------------------------------------------------------------

describe('forceSaveNow — the viewer write gate (audit A2)', () => {
  it('does not PUT when the caller is a viewer — the edit never reaches the wire', async () => {
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockResolvedValue(undefined as never);

    await forceSaveNow();

    expect(putSpy).not.toHaveBeenCalled();
  });

  it('does not PUT while the role is still unknown (fails closed)', async () => {
    useUiStore.setState({ activeTournamentRole: null });
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockResolvedValue(undefined as never);

    await forceSaveNow();

    expect(putSpy).not.toHaveBeenCalled();
  });
});

describe('forceSaveNow — 409 re-sync kills the poisoned-blob cascade (audit A3)', () => {
  /** The state PUT is all-or-nothing. Before this fix, ONE rejected edit (e.g.
   *  deleting a player a generated draw uses) stayed in the store, so every
   *  later save re-sent the same rejected blob and 409'd too — roster editing
   *  was dead until the operator reloaded. */
  function conflict() {
    const err = new Error(
      'These players are placed in a generated draw and cannot be removed: p1',
    ) as Error & { response: { status: number } };
    err.response = { status: 409 };
    return err;
  }

  it('re-hydrates from the server after a 409 so the NEXT save is clean', async () => {
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue(undefined as never);
    const getSpy = vi
      .spyOn(clientModule.apiClient, 'getTournamentState')
      .mockResolvedValue({
        config: useTournamentStore.getState().config,
        players: [{ id: 'p1', name: 'Restored', groupId: 'g1' }],
      } as never);

    // The rejected save.
    await expect(forceSaveNow()).rejects.toThrow(/generated draw/);

    // It re-synced from the server rather than leaving the bad value in place.
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(useTournamentStore.getState().players).toEqual([
      { id: 'p1', name: 'Restored', groupId: 'g1' },
    ]);
    // ...and it told the operator, rather than failing silently.
    expect(useUiStore.getState().toasts.at(-1)?.message).toMatch(/rejected/i);

    // THE CASCADE: the next save now goes through instead of 409-ing forever.
    _resetSaveStateForTests();
    useUiStore.setState({
      activeTournamentId: 'test-tournament-1',
      activeTournamentRole: 'owner',
    });
    await forceSaveNow();
    expect(putSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-sync on a transient failure — unsaved work is kept', async () => {
    // A network error / 5xx is retryable. Discarding the operator's edits there
    // would be data loss; only a 409 (the server rejected the CONTENT) resyncs.
    vi.spyOn(clientModule.apiClient, 'putTournamentState').mockRejectedValue(
      new Error('Network Error'),
    );
    const getSpy = vi.spyOn(clientModule.apiClient, 'getTournamentState');

    await expect(forceSaveNow()).rejects.toThrow(/network/i);

    expect(getSpy).not.toHaveBeenCalled();
    expect(useUiStore.getState().persistStatus).toBe('error');
  });
});

describe('forceSaveNow — in-flight race safety', () => {
  it('does not fire a second PUT when forceSaveNow is called while a PUT is in flight', async () => {
    const put1 = makePut();
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockReturnValueOnce(put1.promise as unknown as ReturnType<typeof clientModule.apiClient.putTournamentState>);

    forceSaveNow();
    expect(putSpy).toHaveBeenCalledTimes(1);

    // Second call while first is in flight must not fire another PUT.
    forceSaveNow();
    expect(putSpy).toHaveBeenCalledTimes(1); // still only one PUT

    put1.resolve();
    await put1.promise;
  });

  it('fires a follow-up PUT after the in-flight one lands when state changed during the flight', async () => {
    const put1 = makePut();
    const put2 = makePut();
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockReturnValueOnce(put1.promise as unknown as ReturnType<typeof clientModule.apiClient.putTournamentState>)
      .mockReturnValueOnce(put2.promise as unknown as ReturnType<typeof clientModule.apiClient.putTournamentState>);

    // Start first PUT.
    const p1 = forceSaveNow();
    expect(putSpy).toHaveBeenCalledTimes(1);

    // State changes WHILE the first PUT is in flight — simulates operator
    // typing in the name field and blurring during a slow network request.
    useTournamentStore.setState({
      config: {
        ...(useTournamentStore.getState().config!),
        tournamentName: 'Changed During Flight',
      },
    });

    // The second forceSaveNow (or subscribe handler) signals a followup.
    forceSaveNow();
    expect(putSpy).toHaveBeenCalledTimes(1); // still only one PUT

    // Land the first PUT.
    put1.resolve();
    await p1;

    // The follow-up debounce timer should now be armed.
    // Advance fake timers to fire it.
    vi.advanceTimersByTime(600);
    // Allow microtask queue to flush.
    await Promise.resolve();
    await Promise.resolve();

    // A second PUT should have been fired.
    expect(putSpy).toHaveBeenCalledTimes(2);

    put2.resolve();
    await put2.promise;
  });

  it('does NOT fire a follow-up when state did NOT change during the flight', async () => {
    const put1 = makePut();
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockReturnValueOnce(put1.promise as unknown as ReturnType<typeof clientModule.apiClient.putTournamentState>);

    const p1 = forceSaveNow();
    expect(putSpy).toHaveBeenCalledTimes(1);

    // No state change — just wait for the PUT to land.
    put1.resolve();
    await p1;

    // Advance timers well past the debounce window.
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    // No follow-up PUT should fire.
    expect(putSpy).toHaveBeenCalledTimes(1);
  });
});

// ---- Snapshot round-trip: planFinalized (Task 17) -----------------------

describe('snapshot — planFinalized persistence', () => {
  it('includes planFinalized=true in the PUT payload so a config save preserves it', async () => {
    // This test proves the core persistence fix: before Task 17, snapshot()
    // omitted planFinalized, so any state PUT reset it to false via
    // Pydantic's default. Now planFinalized must appear in every PUT body.
    const put1 = makePut();
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockReturnValueOnce(
        put1.promise as unknown as ReturnType<
          typeof clientModule.apiClient.putTournamentState
        >,
      );

    useTournamentStore.setState({ planFinalized: true });
    const p = forceSaveNow();

    expect(putSpy).toHaveBeenCalledWith(
      'test-tournament-1',
      expect.objectContaining({ planFinalized: true }),
    );

    put1.resolve();
    await p;
  });

  it('includes planFinalized=false in the PUT payload when not yet finalized', async () => {
    const put1 = makePut();
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockReturnValueOnce(
        put1.promise as unknown as ReturnType<
          typeof clientModule.apiClient.putTournamentState
        >,
      );

    useTournamentStore.setState({ planFinalized: false });
    const p = forceSaveNow();

    expect(putSpy).toHaveBeenCalledWith(
      'test-tournament-1',
      expect.objectContaining({ planFinalized: false }),
    );

    put1.resolve();
    await p;
  });
});

// ---- Snapshot round-trip: Entries provenance (SP-E1-1) ------------------
//
// Seam A writes `sourceEntryId` + `remarks` onto the roster player. The
// backend `PlayerDTO` is a StrictModel, so if the frontend dropped either
// field the very next autosave would send a player the server no longer
// recognizes as the one it stored — the provenance link the desk and the
// operator both rely on would vanish on the first config edit after a commit.
//
// The load side is exercised through the 409 re-sync path, which is the one
// place `hydrate()` runs from a server payload inside a unit test. The save
// side is the PUT body. Together that is a full server → store → server cycle.

describe('snapshot — Entries provenance survives a load/save cycle', () => {
  function conflict() {
    const err = new Error('rejected') as Error & { response: { status: number } };
    err.response = { status: 409 };
    return err;
  }

  /** Drive one 409 re-sync so `hydrate()` runs against `serverState`, then
   *  return the body of the NEXT PUT. */
  async function roundTrip(serverState: Record<string, unknown>) {
    const putSpy = vi
      .spyOn(clientModule.apiClient, 'putTournamentState')
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue(undefined as never);
    vi.spyOn(clientModule.apiClient, 'getTournamentState').mockResolvedValue({
      config: useTournamentStore.getState().config,
      ...serverState,
    } as never);

    await expect(forceSaveNow()).rejects.toThrow();

    _resetSaveStateForTests();
    useUiStore.setState({
      activeTournamentId: 'test-tournament-1',
      activeTournamentRole: 'owner',
    });
    await forceSaveNow();
    return putSpy.mock.calls.at(-1)?.[1] as unknown as Record<string, unknown>;
  }

  it('a committed player keeps sourceEntryId + entryPlayerId + remarks through hydrate → PUT', async () => {
    // Typed as PlayerDTO on purpose: deleting either field from the interface
    // is then a `tsc -b` failure here, not just a silent runtime pass.
    const committed: PlayerDTO = {
      id: 'p1',
      name: 'Alice',
      groupId: 'g1',
      availability: [],
      sourceEntryId: 'e-9f6d',
      // R-DM-2(a): sourceEntryId points at ONE entry; this points at the
      // HUMAN, who routinely holds several.
      entryPlayerId: 'ep-4c21',
      remarks: "can't play before 6pm Saturday",
    };
    const body = await roundTrip({ players: [committed] });

    expect(body.players).toEqual([
      expect.objectContaining({
        id: 'p1',
        sourceEntryId: 'e-9f6d',
        entryPlayerId: 'ep-4c21',
        remarks: "can't play before 6pm Saturday",
      }),
    ]);
  });

  // NEGATIVE CONTROL. The assertion above is only meaningful if `snapshot()`
  // can actually drop things — otherwise it proves nothing but that objects
  // are objects. `standings` is server-derived and deliberately excluded from
  // the snapshot allowlist, so it hydrates into the store and is then dropped
  // on the way back out. Same cycle, same mechanism, opposite outcome: the
  // allowlist is real, and `sourceEntryId` survives because it is on it.
  it('a field OUTSIDE the snapshot allowlist is dropped by the same cycle', async () => {
    const body = await roundTrip({
      players: [],
      standings: [{ groupId: 'g1', wins: 1, losses: 0 }],
    });

    // It reached the store...
    expect(useTournamentStore.getState().standings).toHaveLength(1);
    // ...and did NOT reach the wire.
    expect(body.standings).toBeUndefined();
  });
});
