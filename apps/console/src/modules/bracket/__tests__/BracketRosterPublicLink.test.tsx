/**
 * OPR-0908-6 — the roster pane's link to the PUBLIC player profile.
 *
 * The console runs on the operator origin and the entrant tier on its own
 * (SP-HOST-1), so this URL cannot be composed client-side: it comes from
 * `GET /tournaments/{id}/entry-page/public-site`, which is the entry page's
 * twin of the display token's `url`. Separate file from
 * `BracketRosterTab.test.tsx` because it needs a router and a bracket api
 * carrying a workspace id — the shared file's mocks deliberately carry
 * neither.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BracketRosterTab } from '../BracketRosterTab';
import { useTournamentStore } from '../../../store/tournamentStore';

const mockPublicSite = vi.fn();

vi.mock('../../../api/client', () => ({
  apiClient: {
    getEntryPagePublicSite: (...args: unknown[]) => mockPublicSite(...args),
  },
}));

vi.mock('../../../api/bracketClient', async () => {
  const { createContext } = await import('react');
  return {
    BracketApiContext: createContext<object | null>({}),
    useBracketApi: () => ({ tournamentId: 't-1', eventUpsert: vi.fn() }),
  };
});

vi.mock('../../../hooks/useBracket', () => ({
  useBracket: () => ({
    data: null,
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

const site = (over: Record<string, unknown> = {}) => ({
  origin: 'https://play.example.test',
  slug: 'autumn-open',
  url: 'https://play.example.test/e/autumn-open',
  audience: 'public',
  entrantsPublished: true,
  drawsPublished: false,
  ...over,
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  mockPublicSite.mockReset();
  useTournamentStore.setState({
    bracketPlayers: [{ id: 'p-alex-tan', name: 'Alex Tan' }],
  });
});

const openAlex = () => {
  fireEvent.click(screen.getByTestId('roster-row-p-alex-tan'));
};

describe('roster pane — public profile link', () => {
  it('opens the public profile on the play origin, in a new tab, keyed by the roster id', async () => {
    mockPublicSite.mockResolvedValue(site());
    render(
      <MemoryRouter>
        <BracketRosterTab />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockPublicSite).toHaveBeenCalledWith('t-1'));
    openAlex();

    const link = await screen.findByTestId('bracket-player-public-profile-link');
    // The roster row id IS the public person key (P6's one key space).
    expect(link).toHaveAttribute(
      'href',
      'https://play.example.test/e/autumn-open/players/p-alex-tan',
    );
    expect(link).toHaveAttribute('target', '_blank');
    // The operator's own record of the person is kept, not replaced.
    expect(screen.getByTestId('bracket-player-matches-link')).toBeInTheDocument();
  });

  it('offers no public link while the page publishes nobody', async () => {
    mockPublicSite.mockResolvedValue(
      site({ entrantsPublished: false, drawsPublished: false }),
    );
    render(
      <MemoryRouter>
        <BracketRosterTab />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockPublicSite).toHaveBeenCalled());
    openAlex();
    expect(screen.getByTestId('bracket-player-matches-link')).toBeInTheDocument();
    expect(
      screen.queryByTestId('bracket-player-public-profile-link'),
    ).not.toBeInTheDocument();
  });

  it('offers no public link when the workspace has no entry page at all', async () => {
    mockPublicSite.mockRejectedValue(new Error('404'));
    render(
      <MemoryRouter>
        <BracketRosterTab />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockPublicSite).toHaveBeenCalled());
    openAlex();
    expect(
      screen.queryByTestId('bracket-player-public-profile-link'),
    ).not.toBeInTheDocument();
  });
});
