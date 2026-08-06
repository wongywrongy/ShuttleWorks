/**
 * SP-E4 — Meet Configuration is two tabs: Engine and Events.
 *
 * Engine tab = the CP-SAT input surface: the shared scoring field set
 * (score type / points / match format / deuce) + rest, with the solver
 * knobs below. Events tab = meet type + lineup position counts
 * (rankCounts); the player-assignment grid stays in Roster. The section
 * label is 'Events' (shared grammar with Bracket Configuration); its URL
 * value stays 'meet'.
 *
 * These render the real `TournamentSetupPage`; `useTournament` reads the
 * Zustand store directly (no network), so seeding the store is enough.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TournamentSetupPage } from '../TournamentSetupPage';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useUiStore } from '../../../store/uiStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { TournamentConfig } from '../../../api/dto';

function seed(overrides: Partial<TournamentConfig> = {}) {
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 30,
      freezeHorizonSlots: 0,
      rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
      scoringFormat: 'badminton',
      setsToWin: 2,
      pointsPerSet: 21,
      deuceEnabled: true,
      meetMode: 'dual',
      ...overrides,
    },
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/setup']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<TournamentSetupPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  seed();
  // Lock-guard tests below flip global store state (isScheduleLocked,
  // useUiStore's unlockModalState) — reset both so ordering can't leak
  // an open modal / stuck lock into an unrelated test.
  useTournamentStore.setState({ isScheduleLocked: false, schedule: null });
  useUiStore.getState().setUnlockModalState(null);
});

/** Every config section is collapsed on arrival; open them all before
 *  asserting on the controls inside (a negative assertion against a
 *  collapsed form would pass without testing anything). */
function expandConfigSections() {
  screen
    .getAllByRole('button', { expanded: false })
    .forEach((btn) => fireEvent.click(btn));
}

describe('Meet Configuration (one merged surface)', () => {
  it('has no Engine/Events switch: Configuration is a single form', () => {
    renderPage();
    expect(
      screen.queryByRole('radiogroup', { name: /Configuration section/i }),
    ).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Engine' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Events' })).toBeNull();
  });

  it('carries the engine AND the meet-structure sections on one surface', () => {
    renderPage();
    // Section titles are visible while collapsed: the surface opens as a
    // readable list of what it holds.
    // No "Format" section: it collided with the "Match format" row in
    // Scoring, and Meet type is now a row inside Events.
    expect(screen.queryByRole('button', { name: /^Format$/ })).toBeNull();
    for (const title of ['Events', 'Scoring', 'Timing', 'Optimisation goals', 'Advanced solver']) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });
  it('shows the scoring field set + rest', () => {
    renderPage();
    expandConfigSections();
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    expect(screen.getByLabelText('Points per set')).toBeInTheDocument();
    expect(screen.getByLabelText('Match format')).toBeInTheDocument();
    expect(screen.getByLabelText('Deuce enabled')).toBeInTheDocument();
    expect(screen.getByLabelText('Rest between matches')).toBeInTheDocument();
  });

  it('shows meet type + per-discipline position counts', () => {
    renderPage();
    expandConfigSections();
    expect(screen.getByLabelText('Meet type')).toBeInTheDocument();
    expect(screen.getByLabelText("Men's singles positions")).toBeInTheDocument();
    expect(screen.getByLabelText("Women's singles positions")).toBeInTheDocument();
    expect(screen.getByLabelText("Men's doubles positions")).toBeInTheDocument();
    expect(screen.getByLabelText("Women's doubles positions")).toBeInTheDocument();
    expect(screen.getByLabelText('Mixed doubles positions')).toBeInTheDocument();
  });

  it('changing a position count then saving persists the new rankCounts', async () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderPage();
    expandConfigSections();
    const ms = screen.getByLabelText("Men's singles positions") as HTMLInputElement;
    fireEvent.change(ms, { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('config-save'));
    await waitFor(() => expect(setConfig).toHaveBeenCalled());
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0] as TournamentConfig;
    expect(last.rankCounts?.MS).toBe(5);
  });

  it('save never blanks identity that lives at the workspace level', async () => {
    seed({ tournamentName: undefined, tournamentDate: undefined });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderPage();
    expandConfigSections();
    fireEvent.click(screen.getByTestId('config-save'));
    await waitFor(() => expect(setConfig).toHaveBeenCalled());
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0] as TournamentConfig;
    expect(last.tournamentName).toBeUndefined();
    expect(last.tournamentName).not.toBe('');
    expect(last.tournamentDate).toBeUndefined();
  });

  // SP-C7 — Meet's Engine tab now renders the shared EngineConfigForm
  // (Task 6/7). These pin the two things Task 6's report flagged as
  // untested: the page actions-bar Save actually submits the shared
  // form (via form={FORM_ID}), and the schedule lock guard wired
  // through `guardSave` still gates that save exactly as before.
  describe('the actions-bar Save drives the one shared form', () => {
    it('actions-bar Save submits the shared form and persists an edited field', async () => {
      const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
      renderPage();
    expandConfigSections();
      fireEvent.click(screen.getByLabelText('Reproducible solver run'));
      fireEvent.click(screen.getByTestId('config-save'));
      await waitFor(() => expect(setConfig).toHaveBeenCalled());
      const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0] as TournamentConfig;
      expect(last.deterministic).toBe(true);
    });

    it('when the schedule is locked, actions-bar Save opens the unlock modal instead of saving', async () => {
      seed();
      useTournamentStore.setState({
        isScheduleLocked: true,
        schedule: { assignments: [] } as never,
      });
      const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
      renderPage();
      fireEvent.click(screen.getByTestId('config-save'));

      await waitFor(() =>
        expect(useUiStore.getState().unlockModalState?.open).toBe(true),
      );
      expect(useUiStore.getState().unlockModalState?.actionDescription).toBe(
        'save configuration',
      );
      expect(setConfig).not.toHaveBeenCalled();
    });

    it('declining the unlock modal aborts the save — config is untouched', async () => {
      seed();
      useTournamentStore.setState({
        isScheduleLocked: true,
        schedule: { assignments: [] } as never,
      });
      const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
      renderPage();
      fireEvent.click(screen.getByTestId('config-save'));
      await waitFor(() => expect(useUiStore.getState().unlockModalState).not.toBeNull());

      await act(async () => {
        useUiStore.getState().unlockModalState?.resolve(false);
      });

      expect(setConfig).not.toHaveBeenCalled();
      expect(useTournamentStore.getState().isScheduleLocked).toBe(true);
    });

    it('confirming the unlock modal proceeds with the save and unlocks the schedule', async () => {
      seed();
      useTournamentStore.setState({
        isScheduleLocked: true,
        schedule: { assignments: [] } as never,
      });
      const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
      renderPage();
      fireEvent.click(screen.getByTestId('config-save'));
      await waitFor(() => expect(useUiStore.getState().unlockModalState).not.toBeNull());

      await act(async () => {
        useUiStore.getState().unlockModalState?.resolve(true);
      });

      await waitFor(() => expect(setConfig).toHaveBeenCalled());
      expect(useTournamentStore.getState().isScheduleLocked).toBe(false);
    });
  });
});

/**
 * The RESULTS lock — Meet's counterpart of the bracket's started-draw lock.
 *
 * Meet used to have no such tier. It surfaced only the committed-schedule
 * warning, so a meet mid-event with recorded scores showed an amber "saving
 * will clear the schedule" and still let a director change points-per-set,
 * while a bracket in the same situation went read-only. Same condition, two
 * different answers on two sibling Configuration surfaces.
 */
describe('Meet Configuration — results lock', () => {
  beforeEach(() => {
    useMatchStateStore.setState({ matchStates: {} });
  });

  function withMatchStatus(status: 'called' | 'started' | 'finished') {
    useMatchStateStore.setState({
      matchStates: { m1: { matchId: 'm1', status } },
    });
  }

  it('a started match makes Configuration read-only and removes Save', () => {
    withMatchStatus('started');
    renderPage();

    const fieldset = document.querySelector('fieldset[data-locked]');
    expect(fieldset).not.toBeNull();
    // Read-only presentation, native-disabled enforcement: the values stay
    // legible (that is the point of read-only over disabled) while
    // interaction is off.
    expect(fieldset?.className).toContain('sw-readonly');
    expect(screen.queryByTestId('config-save')).toBeNull();
  });

  it('shows the neutral results ribbon naming the exit path, not the amber one', () => {
    withMatchStatus('finished');
    useTournamentStore.setState({ isScheduleLocked: true });
    renderPage();

    const ribbon = screen.getByTestId('lock-ribbon');
    // The results lock SUPERSEDES the schedule lock: once scores exist,
    // "saving will clear the schedule" is no longer a thing that can happen,
    // so stacking both would state two different answers at once.
    expect(ribbon.dataset.tier).toBe('results');
    expect(ribbon.className).not.toContain('bg-status-warning-bg');
    expect(screen.getByRole('link', { name: /View matches/i })).toBeInTheDocument();
  });

  it('a merely CALLED match does not lock — nothing is recorded yet', () => {
    withMatchStatus('called');
    renderPage();

    expect(document.querySelector('fieldset[data-locked]')).toBeNull();
    expect(screen.getByTestId('config-save')).toBeInTheDocument();
  });

  it('with no match state at all, Configuration stays editable', () => {
    renderPage();
    expect(document.querySelector('fieldset[data-locked]')).toBeNull();
    expect(screen.getByTestId('config-save')).toBeInTheDocument();
  });
});
