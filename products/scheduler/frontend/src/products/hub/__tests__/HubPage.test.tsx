/**
 * Hub navigation + the control plane. Open and the post-Create handler must
 * target /bracket-setup for bracket tournaments (was /bracket pre-Bundle-3).
 * The Hub filters workspaces by status facet (All / Active / Draft / Shared /
 * Needs attention) and shows them as one time-sorted flat list.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('offers the status-facet strip (All / Active / Draft / Shared / Needs attention)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^All\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Active\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Draft\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Shared\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Needs attention/ })).toBeInTheDocument();
  });

  it('a status facet filters the flat list (Active hides both drafts)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    // Both seeded workspaces are status:'draft', so the Active facet empties the list.
    fireEvent.click(screen.getByRole('button', { name: /^Active\b/ }));
    expect(screen.queryByText('Bracket A')).not.toBeInTheDocument();
    expect(screen.queryByText('Meet A')).not.toBeInTheDocument();
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
