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
  // Arm the active tournament id so forceSaveNow doesn't short-circuit.
  useUiStore.setState({ activeTournamentId: 'test-tournament-1' });
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
