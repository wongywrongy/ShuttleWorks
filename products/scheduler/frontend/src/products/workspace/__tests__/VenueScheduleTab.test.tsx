/**
 * Venue & schedule: the two lock problems this surface carried.
 *
 * D15 — it saves on change with NO Save button, under a ribbon warning that
 * "saving these settings will clear" the committed schedule. That copy is
 * shared with the two engine Configuration surfaces, which DO have a Save, so
 * it is right there and wrong here: on this page there is no saving to avoid.
 * An operator looking for the Save they were warned about concludes the fields
 * are safe to touch. They are not. Each one applies immediately, and under the
 * lock the FIRST change opens the confirm-unlock modal whose OK clears the
 * schedule.
 *
 * D5, from the other end — Meet Configuration announces "Settings are
 * read-only while matches are in play" and enforces it with a disabled
 * fieldset. This surface holds court count, slot duration and the day window,
 * which are settings by any reading and the most scheduling-structural fields
 * in the product, and it had no results lock at all. The banner was over-
 * claiming, one nav item away, on exactly the fields where being wrong costs
 * the most.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VenueScheduleTab } from '../VenueScheduleTab';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { apiClient } from '../../../api/client';

function mount() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/ws-venue']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<VenueScheduleTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Put the match-state store in a "play has begun" state. */
function withMatchInPlay() {
  useMatchStateStore.setState({
    matchStates: { m1: { matchId: 'm1', status: 'started' } },
  } as never);
}

beforeEach(() => {
  vi.spyOn(apiClient, 'getMatchStates').mockResolvedValue({} as never);
  useMatchStateStore.setState({ matchStates: {} } as never);
  useTournamentStore.setState({
    isScheduleLocked: false,
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 30,
      freezeHorizonSlots: 0,
    },
  });
});

describe('VenueScheduleTab — autosave without a Save (D15)', () => {
  it('has no Save control, and says so', () => {
    mount();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.getByTestId('venue-save-note')).toHaveTextContent(/no Save on this page/i);
  });

  it('under a committed schedule, names when the clear actually fires', () => {
    useTournamentStore.setState({ isScheduleLocked: true });
    mount();
    // The ribbon states the condition; this states the trigger the ribbon's
    // shared copy gets wrong here.
    expect(screen.getByTestId('lock-ribbon').dataset.tier).toBe('schedule');
    const note = screen.getByTestId('venue-save-note');
    expect(note).toHaveTextContent(/next change asks you to confirm/i);
    expect(note).toHaveTextContent(/confirming clears that schedule/i);
  });

  it('says nothing about clearing when there is no schedule to clear', () => {
    mount();
    expect(screen.queryByTestId('lock-ribbon')).toBeNull();
    expect(screen.getByTestId('venue-save-note')).not.toHaveTextContent(/clears/i);
  });
});

describe('VenueScheduleTab — the results lock the read-only banner promised (D5)', () => {
  it('goes read-only once a match is in play', () => {
    withMatchInPlay();
    const { container } = mount();

    const fieldset = container.querySelector('fieldset[data-locked]');
    expect(fieldset).toBeDisabled();
    // Every field, not a sampling: the whole point of the fieldset is that
    // none of them is left behind.
    for (const label of [
      'Court count',
      'Slot duration in minutes',
      'Day start',
      'Day end',
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });

  it('says which lock it is, and where the state is resolved', () => {
    withMatchInPlay();
    mount();
    // Same tier and vocabulary as Meet and Bracket Configuration, so an
    // operator learns one lock, not three.
    expect(screen.getByTestId('lock-ribbon').dataset.tier).toBe('results');
    expect(screen.getByRole('link', { name: /View matches/i })).toHaveAttribute(
      'href',
      '/tournaments/t1/matches',
    );
    expect(screen.getByTestId('venue-save-note')).toHaveTextContent(
      /read-only while matches are in play/i,
    );
  });

  it('the results lock supersedes the schedule ribbon rather than stacking', () => {
    // Once scores exist, "saving will clear the schedule" can no longer
    // happen; showing both states two different answers at once.
    useTournamentStore.setState({ isScheduleLocked: true });
    withMatchInPlay();
    mount();
    expect(screen.getAllByTestId('lock-ribbon')).toHaveLength(1);
    expect(screen.getByTestId('lock-ribbon').dataset.tier).toBe('results');
  });

  it('a match merely CALLED does not lock: nothing is recorded yet', () => {
    useMatchStateStore.setState({
      matchStates: { m1: { matchId: 'm1', status: 'called' } },
    } as never);
    mount();
    expect(screen.getByLabelText('Court count')).not.toBeDisabled();
  });

  it('stays editable with no matches in play', async () => {
    mount();
    const courts = screen.getByLabelText('Court count');
    expect(courts).not.toBeDisabled();
    fireEvent.change(courts, { target: { value: '6' } });
    // `set` routes through confirmUnlock, which resolves immediately when
    // nothing is locked but is still a promise.
    await waitFor(() =>
      expect(useTournamentStore.getState().config?.courtCount).toBe(6),
    );
  });
});
