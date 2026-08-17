/**
 * Hub navigation + the control plane. Open and the post-Create handler must
 * target /bracket-setup for bracket tournaments (was /bracket pre-Bundle-3).
 * The Hub filters workspaces by lifecycle facet (All / Setup / Ready / Live /
 * Complete / Shared / Needs attention / Archived — derived phase, not the
 * operator-set status) and shows them as one time-sorted flat list.
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

function mount(refObj: { current: string }) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <HubPage />
              <LocationProbe refObj={refObj} />
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
  it('is a control plane with search + module language, not "New event"', async () => {
    mount({ current: '' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Search workspaces')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new event/i })).not.toBeInTheDocument();
  });

  it('hides zero-count facet chips — only All and the facets with content render (H1.1)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    // Both seeded workspaces are un-started drafts: All + Setup carry counts,
    // every other facet is zero and must stay off the strip — eight "0" chips
    // above two rows is a big dashboard's clothes on an empty one.
    // The two drafts flag "Needs attention", so that chip has a count too.
    expect(screen.getByRole('button', { name: /^All\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Setup\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Needs attention/ })).toBeInTheDocument();
    for (const name of [/^Ready\b/, /^Live\b/, /^Complete\b/, /^Shared\b/, /^Archived\b/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('a lifecycle facet filters the flat list (Setup shows the un-started pair)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Setup\b/ }));
    expect(screen.getByText('Bracket A')).toBeInTheDocument();
    expect(screen.getByText('Meet A')).toBeInTheDocument();
  });

  it('offers the quiet create affordance while the list is short (H1.2)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    expect(screen.getByTestId('hub-quiet-create')).toHaveTextContent(
      'Create your next workspace',
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

  it('rows carry a Modules column (dashboard redesign)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    // The redesign re-adds a Modules column: one cell per row. The seeded
    // workspaces have no enabled modules → a dashed kind-default glyph (M for
    // the meet, B for the bracket).
    expect(screen.getAllByTestId('row-modules')).toHaveLength(2);
    expect(screen.getByTestId('row-module-meet')).toBeInTheDocument();
    expect(screen.getByTestId('row-module-bracket')).toBeInTheDocument();
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
 * At 390px the last two chips — "Needs attention" among them, the one an
 * operator scans for — sat at x=390.75 and x=460 with `overflow-x: visible`
 * clipped by an ancestor's `overflow-hidden`: no scrollbar, no swipe, no way
 * to reach them (2026-08-11 design audit, T4).
 */
describe('HubPage — the facet strip is reachable at any width', () => {
  it('holds every facet in one horizontally scrollable strip', async () => {
    mount({ current: '' });
    const strip = await screen.findByTestId('hub-facet-strip');
    // Overflowing content gets a scrollbar instead of being clipped away.
    expect(strip.className).toMatch(/\boverflow-x-auto\b/);
    // Every VISIBLE facet is INSIDE that strip (zero-count chips are hidden
    // since H1.1) — including "Needs attention", the one that used to fall
    // off the end — so scrolling reaches all of them.
    for (const chip of within(strip).getAllByRole('button')) {
      expect(strip.contains(chip)).toBe(true);
    }
    const attention = within(strip).getByRole('button', { name: /needs attention/i });
    fireEvent.click(attention);
    expect(attention).toHaveAttribute('aria-pressed', 'true');
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
