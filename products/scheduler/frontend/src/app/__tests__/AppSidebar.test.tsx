/**
 * AppSidebar — account identity + the sign-out affordance, which must be
 * HIDDEN for the local-mode bootstrap identity (there is no session to end).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppSidebar } from '../AppSidebar';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));

const signOut = vi.fn();

function auth(user: Record<string, unknown> | null, isBootstrap: boolean, authMode: string) {
  vi.mocked(useAuth).mockReturnValue({
    session: user ? { user } : null,
    user,
    loading: false,
    authMode,
    isBootstrap,
    signOut,
    refresh: vi.fn(),
  } as never);
}

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <AppSidebar />
    </MemoryRouter>,
  );

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    signOut.mockReset();
  });

  it('hides Sign out for the local bootstrap identity', () => {
    auth({ id: 'u', email: 'local@dev', isBootstrap: true, authMode: 'local' }, true, 'local');
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('shows Sign out for a signed-in account and wires it to signOut()', () => {
    auth(
      { id: 'u1', email: 'director@club.org', displayName: 'Director', authMode: 'cloud' },
      false,
      'cloud',
    );
    renderSidebar();
    const btn = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(btn);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('titles the account chip with the display name (email fallback)', () => {
    auth(
      { id: 'u1', email: 'director@club.org', displayName: 'Director', authMode: 'cloud' },
      false,
      'cloud',
    );
    renderSidebar();
    expect(screen.getByLabelText('Account')).toHaveAttribute('title', 'Director');
    expect(screen.getByLabelText('Account')).toHaveTextContent('D');
  });

  it('falls back to the email when there is no display name', () => {
    auth({ id: 'u1', email: 'ops@club.org', displayName: null, authMode: 'cloud' }, false, 'cloud');
    renderSidebar();
    expect(screen.getByLabelText('Account')).toHaveAttribute('title', 'ops@club.org');
  });
});
