/**
 * Coverage for the fix where the Matches tab lied about match status:
 * the Status column (added in 053281a) reads `matchStateStore`, but
 * nothing on this surface hydrated it — an operator opening Matches
 * directly (without ever visiting Schedule/Operations/Display, the
 * three surfaces that mount `useMatchStateSync`) would see 'ready' for
 * matches that were actually live or finished.
 *
 * This test proves `MatchesTab` itself mounts the sync hook: rendering
 * it must trigger a match-states fetch for the current tournament id.
 * Without the `useMatchStateSync(tid)` mount in `MatchesTab.tsx`, this
 * assertion fails — nothing else in the render tree calls
 * `apiClient.getMatchStates`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MatchesTab } from '../MatchesTab';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import { apiClient } from '../../../../api/client';
import type { TournamentConfig } from '../../../../api/dto';

vi.mock('../../../../api/client', () => ({
  apiClient: {
    getMatchStates: vi.fn().mockResolvedValue({}),
  },
}));

const TID = 'test-tid';

beforeEach(() => {
  vi.clearAllMocks();
  useTournamentStore.setState({
    config: {} as TournamentConfig,
    groups: [],
    players: [],
    matches: [],
  });
  useUiStore.setState({ activeTournamentRole: 'owner' });
  useMatchStateStore.setState({ matchStates: {}, lastSynced: null });
});

const renderTab = () =>
  render(
    <MemoryRouter initialEntries={[`/tournaments/${TID}/matches`]}>
      <Routes>
        <Route path="/tournaments/:id/matches" element={<MatchesTab />} />
      </Routes>
    </MemoryRouter>,
  );

describe('<MatchesTab /> — match-state hydration', () => {
  it('fetches match states for the tournament on mount', async () => {
    renderTab();
    await waitFor(() => {
      expect(apiClient.getMatchStates).toHaveBeenCalledWith(TID);
    });
  });
});
