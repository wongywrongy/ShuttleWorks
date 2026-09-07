/**
 * Hub navigation + the control plane. The Hub narrows workspaces by TIME
 * (Upcoming · Live · Past, derived from the event date range in the event's
 * timezone), defaults to the combined Live + Upcoming view, and shows them as
 * one flat list ordered live → upcoming → undated → past.
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
    const openButtons = screen.getAllByRole('button', { name: 'Open workspace' });
    fireEvent.click(openButtons[0]); // bracket row first (soonest upcoming)
    expect(loc.current).toBe('/tournaments/br1/overview');
  });

  it('Open on a meet tournament navigates to its Overview', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByRole('button', { name: 'Open workspace' });
    fireEvent.click(openButtons[1]); // meet row second
    expect(loc.current).toBe('/tournaments/me1/overview');
  });
});

describe('HubPage time-oriented control plane', () => {
  it('keeps the chosen view in the URL and returns to the default on a second click', async () => {
    const loc = { current: '' };
    const search = { current: '' };
    mount(loc, search);
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    // The default view is Live + Upcoming: both chips read as selected, and
    // the URL carries no `view` at all.
    expect(screen.getByRole('button', { name: /^Upcoming\b/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Live\b/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Past\b/ })).toHaveAttribute('aria-pressed', 'false');
    expect(search.current).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /^Past\b/ }));
    expect(search.current).toContain('view=past');
    fireEvent.click(screen.getByRole('button', { name: /^Past\b/ }));
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

  it('offers exactly the three time views and nothing else', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    const strip = screen.getByTestId('hub-facet-strip');
    expect(within(strip).getAllByRole('button').map((b) => b.textContent?.trim().split(' ')[0]))
      .toEqual(['Upcoming', 'Live', 'Past']);
    // The lifecycle/status facets are gone, not relabelled.
    for (const name of [/^All\b/, /^Active\b/, /^Setup\b/, /^Ready\b/, /^Complete\b/, /Needs attention/, /^Shared\b/, /^Archived\b/]) {
      expect(within(strip).queryByRole('button', { name })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /^Past\b/ }));
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

  it('selecting a row populates the inspector with its module catalog', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Meet A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Meet A'));
    expect(screen.getByText('MODULES')).toBeInTheDocument();
  });

  it('rows carry module glyphs with accessible names, and no attention prose', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      {
        id: 'x1', name: 'Glyph Cup', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2099-12-01', status: 'active' as const,
        modules: [
          { moduleId: 'meet', status: 'enabled', config: null },
          { moduleId: 'display', status: 'enabled', config: null },
        ],
      },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText(/Glyph Cup/i)).toBeInTheDocument());
    const glyphs = screen.getByTestId('row-modules');
    expect(within(glyphs).getByRole('img', { name: 'Meet' })).toBeInTheDocument();
    expect(within(glyphs).getByRole('img', { name: 'Display' })).toBeInTheDocument();
    // Nothing is wrong with this workspace, so no attention dot at all.
    expect(screen.queryByTestId('row-attention')).toBeNull();
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

  it('suppresses a never-varying Complete chip already stated by the facet (SWP-2)', async () => {
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
    await waitFor(() => expect(screen.getByRole('button', { name: /^Past\b/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Past\b/ }));
    expect(screen.getByText('Complete One')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Past\b/ })).toHaveTextContent('2');
    expect(screen.queryByTestId('row-lifecycle')).not.toBeInTheDocument();
  });

  it('"New workspace" navigates to the dedicated /new surface', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
    expect(loc.current).toBe('/new');
  });

  it('the inspector module map reads the real modules[] DTO when present (not only kind)', async () => {
    vi.mocked(apiClient.listTournaments).mockResolvedValue([
      {
        id: 'x1', name: 'X Workspace', kind: 'meet' as const, role: 'owner' as const,
        tournamentDate: '2026-12-01', status: 'draft' as const,
        modules: [
          { moduleId: 'meet', status: 'enabled', config: null },
          { moduleId: 'display', status: 'enabled', config: null },
        ],
      },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('X Workspace')).toBeInTheDocument());
    // Select the row → the inspector's module map reflects the DTO: Display
    // enabled (a kind=meet default would NOT enable it) alongside Meet.
    fireEvent.click(screen.getByText('X Workspace'));
    expect(screen.getByText('MODULES')).toBeInTheDocument();
    const displayRow = screen.getByText('Display').closest('li')!;
    expect(displayRow.textContent).toMatch(/enabled/i);
    const meetRow = screen.getByText('Meet').closest('li')!;
    expect(meetRow.textContent).toMatch(/enabled/i);
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
    for (const chip of within(strip).getAllByRole('button')) {
      expect(strip.contains(chip)).toBe(true);
    }
    const past = within(strip).getByRole('button', { name: /^Past\b/ });
    fireEvent.click(past);
    expect(past).toHaveAttribute('aria-pressed', 'true');
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
