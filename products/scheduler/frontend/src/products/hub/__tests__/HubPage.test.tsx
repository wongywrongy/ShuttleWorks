/**
 * Dashboard navigation: Open and the post-Create handler must target
 * /bracket-setup for bracket tournaments (was /bracket pre-Bundle-3).
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

// Auth gate / theme / density hooks are no-ops here — we mount the
// page directly without AuthGuard or the wider AppShell.
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
        {/* Catch-all so navigate('/tournaments/t1/bracket-setup') doesn't 404. */}
        <Route path="/tournaments/:id/*" element={<LocationProbe refObj={refObj} />} />
        <Route path="/new" element={<LocationProbe refObj={refObj} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(apiClient.listTournaments).mockResolvedValue([
    {
      id: 'br1', name: 'Bracket A', kind: 'bracket' as const, role: 'owner' as const,
      tournamentDate: null, status: 'draft' as const,
    },
    {
      id: 'me1', name: 'Meet A', kind: 'meet' as const, role: 'owner' as const,
      tournamentDate: null, status: 'draft' as const,
    },
  ] as never);
});

describe('HubPage navigation', () => {
  it('Open on a bracket tournament navigates to /bracket-setup', async () => {
    const loc = { current: '' };
    mount(loc);
    // Wait for the listTournaments mock to resolve and render.
    await waitFor(() => expect(screen.getByText(/Bracket A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByRole('button', { name: /open/i });
    // Order: bracket row first (owner, first in mock list).
    fireEvent.click(openButtons[0]);
    expect(loc.current).toBe('/tournaments/br1/bracket-setup');
  });

  it('Open on a meet tournament navigates to /setup', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByRole('button', { name: /open/i });
    fireEvent.click(openButtons[1]); // meet row, second in list
    expect(loc.current).toBe('/tournaments/me1/setup');
  });
});

describe('HubPage module-aware control plane', () => {
  it('uses workspace / module language, not "event" / "New event"', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('Your workspaces')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument();
    expect(screen.queryByText('Your events')).not.toBeInTheDocument();
  });

  it('shows module chips derived from kind (meet→Meet+Display, bracket→Bracket+Display·soon)', async () => {
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    expect(screen.getByTestId('chip-meet')).toHaveTextContent('Meet');
    expect(screen.getByTestId('chip-bracket')).toHaveTextContent('Bracket');
    const display = screen.getAllByTestId('chip-display');
    expect(display).toHaveLength(2); // both rows offer a Display chip
    // The bracket workspace's Display chip is "coming soon".
    expect(display.some((el) => /soon/i.test(el.textContent || ''))).toBe(true);
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
        tournamentDate: null, status: 'draft' as const,
        modules: [
          { moduleId: 'meet', status: 'enabled', config: null },
          { moduleId: 'display', status: 'disabled', config: null },
        ],
      },
    ] as never);
    mount({ current: '' });
    await waitFor(() => expect(screen.getByText('X Workspace')).toBeInTheDocument());
    // Display came from the DTO as 'disabled' (not coming-soon) → chip present, no "soon".
    const display = screen.getByTestId('chip-display');
    expect(display).toBeInTheDocument();
    expect(display).not.toHaveTextContent('soon');
  });
});
