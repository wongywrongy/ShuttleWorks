/**
 * Hub navigation + the control plane. The Hub narrows workspaces by TIME with
 * a single-select Active/Past view (derived from the event date range in the
 * event's timezone) and shows them as one flat Tournament · Dates · Status ·
 * Open · Actions table ordered live → upcoming → undated → past.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HubPage } from '../HubPage';

import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    listTournaments: vi.fn(),
    createTournament: vi.fn(),
    deleteTournament: vi.fn(),
  },
}));

vi.mock('../../../lib/demoClock', () => ({
  demoNow: () => new Date('2026-07-31T05:15:00Z'),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'op@example.com' } }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function LocationProbe({ refObj }: { refObj: { current: string } }) {
  const loc = useLocation();
  refObj.current = loc.pathname;
  return null;
}

function SearchProbe({ refObj }: { refObj: { current: string } }) {
  refObj.current = useLocation().search;
  return null;
}

function mount(
  refObj: { current: string },
  searchRef?: { current: string },
  initialEntry = '/',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <HubPage />
              <LocationProbe refObj={refObj} />
              {searchRef ? <SearchProbe refObj={searchRef} /> : null}
            </>
          }
        />
        <Route path="/tournaments/:id/*" element={<LocationProbe refObj={refObj} />} />
        <Route path="/new" element={<LocationProbe refObj={refObj} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Future dates so both land in "Upcoming" with an "Open workspace" action
  // (no signals → no setup step), which is what the navigation tests click.
  vi.mocked(apiClient.listTournaments).mockResolvedValue([
    {
      id: 'br1', name: 'Bracket A', kind: 'bracket' as const, role: 'owner' as const,
      tournamentDate: '2026-12-01', status: 'draft' as const,
    },
    {
      id: 'me1', name: 'Meet A', kind: 'meet' as const, role: 'owner' as const,
      tournamentDate: '2026-12-02', status: 'draft' as const,
    },
  ] as never);
});

describe('HubPage navigation', () => {
  // Opening a workspace now lands on its in-workspace Overview (the readiness
  // landing); kind-specific routing happens inside the workspace via the sidebar.
  it('Open on a bracket tournament navigates to its Overview', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText(/Bracket A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByTestId('row-open');
    fireEvent.click(openButtons[0]); // bracket row first (soonest upcoming)
    expect(loc.current).toBe('/tournaments/br1/overview');
  });

  it('Open on a meet tournament navigates to the SAME destination', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByTestId('row-open');
    fireEvent.click(openButtons[1]); // meet row second
    expect(loc.current).toBe('/tournaments/me1/overview');
  });

  it('a live workspace opens on the Overview too — one destination per row', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      { id: 'live1', name: 'Taipei Open', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2026-07-31', status: 'active' as const,
        signals: { health: 'good', attention: [], modules: { enabled: 1, available: 0, disabled: 0, comingSoon: 0 }, setup: {}, collaboration: { memberCount: 1, activeInviteCount: 0 }, phase: 'live' as const } },
    ] as never);
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText('Taipei Open')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('row-open'));
    expect(loc.current).toBe('/tournaments/live1/overview');
  });
});

describe('HubPage time-oriented control plane', () => {
  it('uses one demo instant for both facet counts and visible rows', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      { id: 'live', name: 'Taipei Open', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2026-07-31', tournamentEndDate: '2026-08-01', timeZone: 'Asia/Taipei', status: 'active' as const },
      { id: 'up', name: 'Korea Masters', kind: 'bracket' as const, role: 'owner' as const,
        tournamentDate: '2026-08-02', timeZone: 'Asia/Seoul', status: 'draft' as const },
      { id: 'past', name: 'Old Cup', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2026-07-20', timeZone: 'UTC', status: 'complete' as const },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Taipei Open')).toBeInTheDocument());
    // The Active count is the size of the set Active shows: live + upcoming.
    expect(screen.getByRole('radio', { name: /^Active\b/ })).toHaveTextContent('2');
    expect(screen.getByRole('radio', { name: /^Past\b/ })).toHaveTextContent('1');
    expect(screen.getByText('Taipei Open')).toBeInTheDocument();
    expect(screen.getByText('Korea Masters')).toBeInTheDocument();
    expect(screen.queryByText('Old Cup')).not.toBeInTheDocument();
  });

  it('is a single-select view kept in the URL', async () => {
    const loc = { current: '' };
    const search = { current: '' };
    mount(loc, search);
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    // Exactly ONE view is chosen; the default carries no `view` in the URL.
    expect(screen.getByRole('radio', { name: /^Active\b/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^Past\b/ })).toHaveAttribute('aria-checked', 'false');
    expect(search.current).toBe('');

    fireEvent.click(screen.getByRole('radio', { name: /^Past\b/ }));
    expect(search.current).toContain('view=past');
    expect(screen.getByRole('radio', { name: /^Active\b/ })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('radio', { name: /^Active\b/ }));
    expect(search.current).toBe('');
  });

  it('search reaches every workspace, past and undated included', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      { id: 'p1', name: 'Old Cup', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2025-01-01', status: 'active' as const },
      { id: 'n1', name: 'Old Notebook', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: null, status: 'active' as const },
      { id: 'u1', name: 'Spring Open', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2099-05-01', status: 'active' as const },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Spring Open')).toBeInTheDocument());
    // The past workspace is NOT in the default view…
    expect(screen.queryByText('Old Cup')).toBeNull();
    // …but a search finds it anyway, without changing the view.
    fireEvent.change(screen.getByLabelText('Search workspaces'), { target: { value: 'Old' } });
    expect(screen.getByText('Old Cup')).toBeInTheDocument();
    expect(screen.getByText('Old Notebook')).toBeInTheDocument();
    expect(screen.queryByText('Spring Open')).toBeNull();
  });

  it('keeps a deep-linked page through the initial loading pass', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `deep-${String(index + 1).padStart(2, '0')}`,
        name: `Deep ${String(index + 1).padStart(2, '0')}`,
        kind: 'meet' as const,
        role: 'owner' as const,
        tournamentDate: '2026-12-01',
        status: 'draft' as const,
      })) as never,
    );
    mount({ current: '' }, undefined, '/?page=2');
    await waitFor(() => expect(screen.getByText('Deep 21')).toBeInTheDocument());
    expect(screen.queryByText('Deep 01')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('paginates the active hub at twenty rows and exposes an honest count', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `w${String(index + 1).padStart(2, '0')}`,
        name: `Workspace ${String(index + 1).padStart(2, '0')}`,
        kind: 'meet' as const,
        role: 'owner' as const,
        tournamentDate: `2026-12-${String(index + 1).padStart(2, '0')}`,
        status: 'draft' as const,
      })) as never,
    );
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Workspace 01')).toBeInTheDocument());
    expect(screen.getByTestId('hub-pagination')).toHaveTextContent('Showing 1–20 of 21 workspaces');
    expect(screen.queryByText('Workspace 21')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByTestId('hub-pagination')).toHaveTextContent('Showing 21–21 of 21 workspaces');
    expect(screen.getByText('Workspace 21')).toBeInTheDocument();
    expect(screen.queryByText('Workspace 01')).not.toBeInTheDocument();
  });

  it('bounds numbered hub pages for very large collections', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue(
      Array.from({ length: 1000 }, (_, index) => ({
        id: `bound-${String(index + 1).padStart(4, '0')}`,
        name: `Bound ${String(index + 1).padStart(4, '0')}`,
        kind: 'meet' as const,
        role: 'owner' as const,
        tournamentDate: '2026-12-01',
        status: 'draft' as const,
      })) as never,
    );
    mount({ current: '' });
    await waitFor(() => expect(screen.getByTestId('hub-pagination')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /^Page / })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 50' })).toBeInTheDocument();
  });

  it('is a control plane with search + module language, not "New event"', async () => {
    mount({ current: '' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Search workspaces')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new event/i })).not.toBeInTheDocument();
  });

  it('offers exactly the two time views and nothing else', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    const strip = screen.getByTestId('hub-facet-strip');
    expect(within(strip).getAllByRole('radio').map((b) => b.textContent?.trim().split(' ')[0]))
      .toEqual(['Active', 'Past']);
    // The lifecycle/status facets are gone, not relabelled.
    for (const name of [/^All\b/, /^Setup\b/, /^Ready\b/, /^Complete\b/, /Needs attention/, /^Shared\b/, /^Archived\b/]) {
      expect(within(strip).queryByRole('radio', { name })).toBeNull();
    }
    // Sorting is not a control any more: one operational order.
    expect(screen.queryByLabelText('Sort workspaces')).toBeNull();
  });

  it('narrowing to Past shows only finished events', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      { id: 'p1', name: 'Last Season', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2025-03-01', status: 'active' as const },
      { id: 'u1', name: 'Next Season', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2099-03-01', status: 'active' as const },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Next Season')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: /^Past\b/ }));
    expect(screen.getByText('Last Season')).toBeInTheDocument();
    expect(screen.queryByText('Next Season')).toBeNull();
  });

  it('keeps undated workspaces reachable in a compact group in the default view', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      { id: 'n1', name: 'No Date Yet', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: null, status: 'active' as const },
      { id: 'u1', name: 'Next Season', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2099-03-01', status: 'active' as const },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('No Date Yet')).toBeInTheDocument());
    expect(screen.getByTestId('hub-undated-group')).toHaveTextContent('Date not set');
  });

  it('offers the quiet create affordance while the list is short (H1.2)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    expect(screen.getByTestId('hub-quiet-create')).toHaveTextContent(
      'Create a workspace',
    );
  });

  it('search filters the workspace list by name', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Search workspaces'), {
      target: { value: 'Meet' },
    });
    expect(screen.queryByText('Bracket A')).not.toBeInTheDocument();
    expect(screen.getByText('Meet A')).toBeInTheDocument();
  });

  it('selecting a row opens the preview panel and does not navigate', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText('Meet A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Meet A'));
    expect(screen.getByTestId('workspace-inspector')).toBeInTheDocument();
    expect(loc.current).toBe('/');
  });

  it('names its columns Tournament · Dates · Status · Open · Actions', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    const header = screen.getByText('Tournament').parentElement!;
    expect(header.textContent).toBe('TournamentDatesStatusOpenActions');
  });

  it('states attention as one labelled dot that opens the inspector', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    // Both seeded workspaces are owner-drafts → both need attention.
    const dots = screen.getAllByTestId('row-attention');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAccessibleName(/needs attention/i);
    fireEvent.click(dots[0]);
    expect(screen.getByTestId('workspace-inspector')).toBeInTheDocument();
  });

  it('shows a footer summary bar with workspace + attention counts', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    const footer = screen.getByTestId('hub-footer');
    // Both seeded workspaces are owner-drafts → both need attention.
    expect(footer).toHaveTextContent('2 workspaces');
    expect(footer).toHaveTextContent('2 need attention');
  });

  it('counts archived workspaces in the footer', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      { id: 'a', name: 'Done Cup', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: null, status: 'archived' as const },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Done Cup')).toBeInTheDocument());
    expect(screen.getByTestId('hub-footer')).toHaveTextContent('1 archived');
  });

  it('states a status on every row, whether or not the rows agree', async () => {
    const completeSignals = {
      health: 'good' as const,
      attention: [],
      modules: { enabled: 2, available: 0, disabled: 0, comingSoon: 0 },
      setup: { events: true, draws: true },
      collaboration: { memberCount: 1, activeInviteCount: 0 },
      phase: 'complete' as const,
    };
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      { id: 'c1', name: 'Complete One', kind: 'bracket' as const, role: 'owner' as const,
        tournamentDate: '2026-07-01', status: 'active' as const, signals: completeSignals },
      { id: 'c2', name: 'Complete Two', kind: 'bracket' as const, role: 'owner' as const,
        tournamentDate: '2026-07-02', status: 'active' as const, signals: completeSignals },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Past\b/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: /^Past\b/ }));
    expect(screen.getByText('Complete One')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Past\b/ })).toHaveTextContent('2');
    // Both rows say it. A status column that hides itself when every row
    // agrees is blank exactly when it is easiest to read.
    expect(screen.getAllByTestId('row-status').map((n) => n.textContent)).toEqual([
      'Completed',
      'Completed',
    ]);
  });

  it('"New workspace" navigates to the dedicated /new surface', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
    expect(loc.current).toBe('/new');
  });

  it('the preview panel is a preview, not a copy of the workspace Overview', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Meet A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Meet A'));
    const panel = screen.getByTestId('workspace-inspector');
    expect(within(panel).getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByTestId('inspector-checklist')).toBeNull();
    expect(screen.queryByTestId('inspector-next-up')).toBeNull();
    expect(screen.queryByText('MODULES')).toBeNull();
  });
});

/**
 * At 390px the last chips sat past the edge with `overflow-x: visible` clipped
 * by an ancestor's `overflow-hidden`: no scrollbar, no swipe, no way to reach
 * them (2026-08-11 design audit, T4).
 */
describe('HubPage — the view strip is reachable at any width', () => {
  it('holds every view in one horizontally scrollable strip', async () => {
    mount({ current: '' });
    const strip = await screen.findByTestId('hub-facet-strip');
    // Overflowing content gets a scrollbar instead of being clipped away.
    expect(strip.className).toMatch(/\boverflow-x-auto\b/);
    // Every view chip is INSIDE that strip, so scrolling reaches all of them.
    for (const chip of within(strip).getAllByRole('radio')) {
      expect(strip.contains(chip)).toBe(true);
    }
    const past = within(strip).getByRole('radio', { name: /^Past\b/ });
    fireEvent.click(past);
    expect(past).toHaveAttribute('aria-checked', 'true');
  });
});

/**
 * The inspector as a panel (W10 / debt-log:119).
 *
 * It used to be a hand-rolled `<aside className="hidden w-[344px] … lg:flex">`
 * with its own `RailLabel` — a fourth panel geometry and a fourth eyebrow
 * spelling, in an app with one dock and one `DetailPanel.Section`. The `hidden
 * lg:flex` was the sharpest edge of it: below 1024px a Hub row click did
 * nothing at all, on the tablet the owner actually runs.
 */
describe('HubPage — the workspace inspector is a DetailPanel in a DetailDock', () => {
  it('renders inside the shared dock rather than a hand-rolled rail', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Meet A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Meet A'));

    const dock = screen.getByTestId('detail-dock');
    expect(within(dock).getByTestId('workspace-inspector')).toBeInTheDocument();
  });

  it('is not gated behind a breakpoint: a selection is visible at every width', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Meet A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Meet A'));

    // Walk the panel's ancestors: no bare `display:none` anywhere between it
    // and the page. `hidden lg:flex` is the pattern that made the pane silently
    // absent on a tablet; the dock's own narrow fallback handles small widths
    // by presenting the pane as a dialog, not by deleting it. (`overflow-hidden`
    // is a different utility and is the dock's host contract, hence the exact
    // class-token match rather than a substring.)
    let node: HTMLElement | null = screen.getByTestId('workspace-inspector');
    while (node) {
      expect(node.className.split(/\s+/)).not.toContain('hidden');
      node = node.parentElement;
    }
  });

  it('the panel close button clears the selection', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Meet A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Meet A'));
    expect(screen.getByTestId('workspace-inspector')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    // The dock RETAINS the pane's content while it slides shut (inert, then
    // dropped), so the assertion is on it going away, not on it being gone the
    // same tick.
    await waitFor(() => expect(screen.queryByTestId('workspace-inspector')).toBeNull());
  });
});
