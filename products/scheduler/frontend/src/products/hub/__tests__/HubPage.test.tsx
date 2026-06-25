/**
 * Hub navigation + the time-oriented control plane. Open and the post-Create
 * handler must target /bracket-setup for bracket tournaments (was /bracket
 * pre-Bundle-3). The Hub groups workspaces by event date, not status.
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
  it('Open on a bracket tournament navigates to /bracket-setup', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText(/Bracket A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByRole('button', { name: 'Open workspace' });
    fireEvent.click(openButtons[0]); // bracket row first (soonest upcoming)
    expect(loc.current).toBe('/tournaments/br1/bracket-setup');
  });

  it('Open on a meet tournament navigates to /setup', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByRole('button', { name: 'Open workspace' });
    fireEvent.click(openButtons[1]); // meet row second
    expect(loc.current).toBe('/tournaments/me1/setup');
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

  it('groups workspaces chronologically (Upcoming section present)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Bracket A')).toBeInTheDocument());
    expect(screen.getByText('[ UPCOMING ]')).toBeInTheDocument();
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
    expect(screen.getByText('[ MODULES ]')).toBeInTheDocument();
  });

  it('module chips show only enabled modules (one per row, kind-derived)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    // Enabled-only: a meet workspace shows just Meet; a bracket workspace just
    // Bracket. Available/disabled modules are not shown in the row.
    expect(screen.getAllByTestId('chip-meet')).toHaveLength(1);
    expect(screen.getAllByTestId('chip-bracket')).toHaveLength(1);
    expect(screen.queryAllByTestId('chip-display')).toHaveLength(0);
  });

  it('"New workspace" navigates to the dedicated /new surface', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
    expect(loc.current).toBe('/new');
  });

  it('module chips read the real modules[] DTO when present (not only kind)', async () => {
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
    // Display enabled in the DTO (a kind=meet default would NOT enable it) → its
    // chip shows; bracket is not enabled → no chip.
    expect(screen.getByTestId('chip-meet')).toBeInTheDocument();
    expect(screen.getByTestId('chip-display')).toBeInTheDocument();
    expect(screen.queryAllByTestId('chip-bracket')).toHaveLength(0);
  });
});
