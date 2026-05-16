/**
 * Dashboard navigation: Open and the post-Create handler must target
 * /bracket-setup for bracket tournaments (was /bracket pre-Bundle-3).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TournamentListPage } from '../../pages/TournamentListPage';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: {
    listTournaments: vi.fn(),
    createTournament: vi.fn(),
    deleteTournament: vi.fn(),
  },
}));

// Auth gate / theme / density hooks are no-ops here — we mount the
// page directly without AuthGuard or the wider AppShell.
vi.mock('../../context/AuthContext', () => ({
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
              <TournamentListPage />
              <LocationProbe refObj={refObj} />
            </>
          }
        />
        {/* Catch-all so navigate('/tournaments/t1/bracket-setup') doesn't 404. */}
        <Route path="/tournaments/:id/*" element={<LocationProbe refObj={refObj} />} />
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

describe('TournamentListPage navigation', () => {
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
