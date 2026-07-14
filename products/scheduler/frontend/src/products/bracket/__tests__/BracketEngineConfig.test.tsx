/**
 * Bracket Engine tab — now the shared `EngineConfigForm` (Task 8). Replaces
 * `BracketEngineSection.test.tsx`: the immediate-write pattern it pinned was
 * intentionally retired for Save-on-submit (matching Meet), and the option
 * set now matches Meet's (Scoring + Timing + Advanced solver + Optimisation
 * goals) — that convergence is the point of this task (the two Engine tabs
 * were visibly different surfaces before it).
 *
 * Two independent lock signals, both exercised here:
 *  - Soft lock (`hasSchedule`, i.e. bracket assignments exist): saving
 *    routes through the confirm-unlock modal, mirroring Meet's
 *    `useLockGuard`. Declining must not save.
 *  - Hard lock (`isLocked`, i.e. a draw has started): the whole fieldset is
 *    disabled — no confirm is offered, since the server refuses regardless
 *    (409 DRAW_STARTED, never overridable).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BracketTab } from '../BracketTab';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useBracket } from '../../../hooks/useBracket';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

vi.mock('../../../hooks/useBracket', () => ({
  useBracket: vi.fn(),
}));

vi.mock('../../../api/bracketClient', async () => {
  const React = await import('react');
  const BracketApiContext = React.createContext<object | null>(null);
  return {
    BracketApiContext,
    BracketApiProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(BracketApiContext.Provider, { value: {} }, children),
    useBracketApi: () => ({ get: vi.fn().mockResolvedValue(null) }),
  };
});

function baseConfig() {
  return {
    intervalMinutes: 30,
    dayStart: '09:00',
    dayEnd: '18:00',
    breaks: [],
    courtCount: 4,
    defaultRestMinutes: 0,
    freezeHorizonSlots: 0,
    restBetweenRounds: 1,
    scoringFormat: 'simple' as const,
    setsToWin: 2,
    pointsPerSet: 21,
    deuceEnabled: true,
    tournamentName: 'Bracket A',
  };
}

function noSchedule(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [
      {
        id: 'MS-1', discipline: 'MS', format: 'se',
        bracket_size: 8, participant_count: 6, rounds: [], status: 'draft',
      },
    ],
    participants: [],
    play_units: [],
    assignments: [],
    results: [],
  };
}

function withSchedule(): BracketTournamentDTO {
  const data = noSchedule();
  data.events[0].status = 'generated';
  data.assignments = [
    {
      play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    },
  ];
  return data;
}

function withStartedDraw(): BracketTournamentDTO {
  const data = withSchedule();
  data.events[0].status = 'started';
  return data;
}

function renderBracketTab() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1']}>
      <Routes>
        <Route path="/tournaments/:id" element={<BracketTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockBracket(data: BracketTournamentDTO | null) {
  vi.mocked(useBracket).mockReturnValue({
    data,
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
}

beforeEach(() => {
  mockBracket(noSchedule());
  useUiStore.setState({ activeTab: 'bracket-setup', unlockModalState: null });
  useTournamentStore.setState({ config: baseConfig(), bracketPlayers: [] });
});

describe('bracket engine config (shared form)', () => {
  it('exposes the full unified option set — the two Engine tabs no longer differ', () => {
    renderBracketTab();
    // Scoring
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    // Timing
    expect(screen.getByLabelText('Rest between matches')).toBeInTheDocument();
    // Advanced solver (previously Meet-only)
    expect(screen.getByLabelText('Reproducible solver run')).toBeInTheDocument();
    // Solver time limit is meet-only (C10: bracket keeps its own
    // per-request budget — see EngineConfigForm's ENGINE_CONFIG_FIELDS).
    expect(
      screen.queryByLabelText('Solver wall-clock cap in seconds'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Freeze horizon in slots')).toBeInTheDocument();
    // Optimisation goals (previously Meet-only)
    expect(screen.getByLabelText('Maximise court utilisation')).toBeInTheDocument();
    expect(screen.getByLabelText('Enforce game spacing')).toBeInTheDocument();
    expect(screen.getByLabelText('Compact schedule')).toBeInTheDocument();
    expect(screen.getByLabelText('Allow player overlap')).toBeInTheDocument();
  });

  it('renders restBetweenRounds — the one declared bracket-only field', () => {
    renderBracketTab();
    const input = screen.getByLabelText('Rest between rounds (slots)') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('1');
  });

  it('soft lock: saving with a schedule present routes through the confirm modal', async () => {
    mockBracket(withSchedule());
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderBracketTab();

    fireEvent.click(screen.getByRole('button', { name: /Save engine settings/i }));

    await waitFor(() =>
      expect(useUiStore.getState().unlockModalState?.open).toBe(true),
    );
    expect(setConfig).not.toHaveBeenCalled();

    act(() => {
      useUiStore.getState().unlockModalState?.resolve(true);
    });

    await waitFor(() => expect(setConfig).toHaveBeenCalled());
  });

  it('soft lock: declining the confirm does not save', async () => {
    mockBracket(withSchedule());
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderBracketTab();

    fireEvent.click(screen.getByRole('button', { name: /Save engine settings/i }));

    await waitFor(() =>
      expect(useUiStore.getState().unlockModalState?.open).toBe(true),
    );

    act(() => {
      useUiStore.getState().unlockModalState?.resolve(false);
    });

    await waitFor(() =>
      expect(useUiStore.getState().unlockModalState).toBeNull(),
    );
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('hard lock: a started draw disables the fields and offers no confirm', () => {
    mockBracket(withStartedDraw());
    renderBracketTab();

    const fieldset = document.querySelector('fieldset[data-locked]');
    expect(fieldset).not.toBeNull();
    expect(
      screen.getByLabelText('Rest between rounds (slots)'),
    ).toBeDisabled();
    // No Save button to even click through — LockedFieldset disables the
    // whole subtree, including any submit control inside it.
    expect(useUiStore.getState().unlockModalState).toBeNull();
  });

  it('existing scoring behavior still persists correctly (no regression)', async () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderBracketTab();

    fireEvent.click(screen.getByRole('radio', { name: 'Sets' }));
    // Save-on-submit: the click alone must not have written yet.
    expect(setConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Save engine settings/i }));

    await waitFor(() => expect(setConfig).toHaveBeenCalled());
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0];
    expect(last.scoringFormat).toBe('badminton');
  });
});
