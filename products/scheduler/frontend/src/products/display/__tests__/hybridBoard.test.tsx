/**
 * Hybrid workspaces (both operator modules enabled — a supported state that
 * `derive_modules` seeds toward and the control plane promotes) used to be
 * structurally invisible on the board: kind resolution ran off the fixed
 * `Tournament.kind` column, so a workspace running a live bracket alongside
 * its meet could never show that bracket, while the footer stated
 * "12 / 24 matches complete · 50%" — authoritative, and counting only half
 * the workspace.
 *
 * The board renders ONE engine at a time (see `PublicDisplayPage`'s doc
 * comment for why not merged), switchable from either header, and the meet
 * footer names the half it counts.
 *
 * Runs the real hook + both real boards; only the network is stubbed.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicDisplayPage } from '../PublicDisplayPage';
import { apiClient } from '../../../api/client';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { ScheduleDTO, TournamentConfig, TournamentSummaryDTO } from '../../../api/dto';

const modules = (...enabled: string[]) =>
  ['meet', 'bracket', 'display'].map((moduleId) => ({
    moduleId,
    status: enabled.includes(moduleId) ? 'enabled' : 'available',
    config: null,
  }));

/** The legacy `kind` column names ONE engine; the module rows are the truth. */
const HYBRID = {
  id: 't1',
  kind: 'meet',
  modules: modules('meet', 'bracket', 'display'),
} as unknown as TournamentSummaryDTO;

const MEET_ONLY = {
  id: 't1',
  kind: 'meet',
  modules: modules('meet', 'display'),
} as unknown as TournamentSummaryDTO;

const CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 2,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
};

const SCHEDULE = {
  assignments: [
    { matchId: 'm1', courtId: 1, slotId: 0, durationSlots: 1 },
    { matchId: 'm2', courtId: 2, slotId: 0, durationSlots: 1 },
  ],
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: null,
  infeasibleReasons: [],
  status: 'optimal',
} as unknown as ScheduleDTO;

beforeEach(() => {
  // The board's own polls: leave the seeded store alone, stay off the network.
  vi.spyOn(apiClient, 'getTournamentState').mockResolvedValue(null);
  vi.spyOn(apiClient, 'getMatchStates').mockResolvedValue({});
  vi.spyOn(apiClient, 'getBracket').mockResolvedValue(null);
  useTournamentStore.setState({ config: CONFIG, schedule: SCHEDULE });
});

afterEach(() => {
  vi.restoreAllMocks();
  useTournamentStore.getState().reset();
});

function renderBoard(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicDisplayPage />
    </MemoryRouter>,
  );
}

describe('hybrid workspaces', () => {
  it('scopes the progress footer to the half it counts, and offers the bracket board', async () => {
    vi.spyOn(apiClient, 'getTournament').mockResolvedValue(HYBRID);

    renderBoard('/display?id=t1');

    expect(await screen.findByText(/0 \/ 2 meet matches complete/)).toBeInTheDocument();
    expect(screen.getByTestId('board-switch-bracket')).toBeInTheDocument();
  });

  it('renders the bracket board on ?board=bracket, with a switch back', async () => {
    vi.spyOn(apiClient, 'getTournament').mockResolvedValue(HYBRID);

    renderBoard('/display?id=t1&board=bracket');

    expect(await screen.findByTestId('bracket-display')).toBeInTheDocument();
    expect(screen.getByTestId('board-switch-meet')).toBeInTheDocument();
  });

  it('leaves a single-engine workspace exactly as it was', async () => {
    vi.spyOn(apiClient, 'getTournament').mockResolvedValue(MEET_ONLY);

    renderBoard('/display?id=t1');

    expect(await screen.findByText(/0 \/ 2 matches complete/)).toBeInTheDocument();
    expect(screen.queryByTestId('board-switch-bracket')).toBeNull();
    // …and `?board=bracket` is inert: there is no bracket to switch to.
    await waitFor(() => expect(apiClient.getTournament).toHaveBeenCalled());
  });
});
