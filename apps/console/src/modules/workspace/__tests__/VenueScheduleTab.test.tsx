/**
 * Venue & schedule: the two lock problems this surface carried.
 *
 * D15 — it used to save on change with NO Save button, under a ribbon warning
 * that "saving these settings will clear" the committed schedule: copy shared
 * with the two engine Configuration surfaces, which DO have a Save. The first
 * fix shipped a paragraph explaining the discrepancy; R-K removed the
 * discrepancy instead. The page now edits a local draft and commits on Save,
 * like every other settings surface, and the explanatory note is gone with it.
 * The schedule-unlock confirm moved with the commit, from first keystroke to
 * Save - which is what the shared ribbon copy always described.
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

describe('VenueScheduleTab — explicit save (R-K)', () => {
  it('has a Save, and no longer explains why it does not', () => {
    mount();
    expect(screen.getByTestId('venue-save')).toHaveTextContent('Save changes');
    // The note existed only to explain the inconsistency, which is gone.
    expect(screen.queryByTestId('venue-save-note')).toBeNull();
  });

  it('Save is inert until something actually changed', () => {
    mount();
    expect(screen.getByTestId('venue-save')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Court count'), { target: { value: '6' } });
    expect(screen.getByTestId('venue-save')).not.toBeDisabled();
  });

  it('Save stays inert while the config HYDRATES underneath it', async () => {
    // The bug this catches, found in the browser: the draft was seeded from
    // `config` on mount, but the store holds a DEFAULT config until
    // `useTournamentState` hydrates. So the draft captured the default, the
    // arriving server config differed from it, and the page loaded with Save
    // live over a stale snapshot — one click from overwriting the real venue
    // settings with the defaults.
    mount();
    expect(screen.getByTestId('venue-save')).toBeDisabled();

    // Hydration lands: a different config arrives with no operator input.
    useTournamentStore.setState({
      config: {
        intervalMinutes: 20,
        dayStart: '08:00',
        dayEnd: '20:00',
        breaks: [],
        courtCount: 12,
        defaultRestMinutes: 15,
        freezeHorizonSlots: 0,
      },
    });
    await waitFor(() => expect(screen.getByLabelText('Court count')).toHaveValue(12));
    expect(screen.getByTestId('venue-save')).toBeDisabled();
  });

  it('Save releases the page back to the server copy', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Court count'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('venue-save'));
    await waitFor(() => expect(screen.getByTestId('venue-save')).toBeDisabled());
    // A later server-side change now flows through instead of being held off
    // by a draft nobody is editing.
    useTournamentStore.setState({
      config: { ...useTournamentStore.getState().config!, courtCount: 9 },
    });
    await waitFor(() => expect(screen.getByLabelText('Court count')).toHaveValue(9));
  });

  it('an edit does NOT reach the store until Save', async () => {
    // The behaviour the ruling turns on: this page used to commit on keystroke
    // while the SAME fields, reached from Configuration, waited for a button.
    mount();
    fireEvent.change(screen.getByLabelText('Court count'), { target: { value: '6' } });
    expect(useTournamentStore.getState().config?.courtCount).toBe(4);

    fireEvent.click(screen.getByTestId('venue-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().config?.courtCount).toBe(6),
    );
  });

  it('under a committed schedule an edit alone commits nothing', () => {
    useTournamentStore.setState({ isScheduleLocked: true });
    mount();
    expect(screen.getByTestId('lock-ribbon').dataset.tier).toBe('schedule');
    fireEvent.change(screen.getByLabelText('Court count'), { target: { value: '6' } });
    expect(useTournamentStore.getState().config?.courtCount).toBe(4);
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
    // One lock message, one place (A1.1): the ribbon carries the lock. Under
    // it there is nothing to save, so the Save control is absent too.
    expect(screen.queryByTestId('venue-save-note')).toBeNull();
    expect(screen.queryByTestId('venue-save')).toBeNull();
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
    // Save routes through confirmUnlock, which resolves immediately when
    // nothing is locked but is still a promise.
    fireEvent.click(screen.getByTestId('venue-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().config?.courtCount).toBe(6),
    );
  });
});

describe('court policy (SP-COURT-1, ADR 0015)', () => {
  it('defaults to Court-tied; switching to Queue reveals on-deck + per-court pins', async () => {
    mount();
    const tied = screen.getByRole('radio', { name: 'Court-tied' });
    expect(tied).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('On deck count')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Queue' }));
    // The dependent controls appear from the DRAFT, before any save.
    expect(screen.getByLabelText('On deck count')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('venue-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().config?.courtPolicy).toBe('queue'),
    );
  });

  it('per-court chips store ONLY the exceptions, and toggle off cleanly', async () => {
    useTournamentStore.setState({
      config: { ...useTournamentStore.getState().config!, courtPolicy: 'queue' },
    });
    mount();
    fireEvent.click(screen.getByTestId('court-override-1'));
    fireEvent.click(screen.getByTestId('venue-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().config?.courtOverrides).toEqual({ 1: 'pinned' }),
    );
    fireEvent.click(screen.getByTestId('court-override-1'));
    fireEvent.click(screen.getByTestId('venue-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().config?.courtOverrides).toEqual({}),
    );
  });

  it('on-deck count is clamped to CP5 range 1-5', async () => {
    useTournamentStore.setState({
      config: { ...useTournamentStore.getState().config!, courtPolicy: 'queue' },
    });
    mount();
    const deck = screen.getByLabelText('On deck count');
    fireEvent.change(deck, { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('venue-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().config?.onDeckCount).toBe(5),
    );
  });
});
