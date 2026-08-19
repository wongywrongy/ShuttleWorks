/**
 * Global Settings nav shape.
 *
 * Two destinations were removed (console-IA proposal, Theme 4): "Workspace
 * defaults › Modules" was a read-only, zero-control restatement of the
 * per-workspace Modules tab off a hardcoded list that had already drifted (no
 * Entries), and Notifications was an empty "Not available yet" card. Both cost
 * a nav row and answered nothing, and a nav entry that leads to a placeholder
 * teaches the operator this nav is not worth reading.
 *
 * Pinned because the removal is the point: a future "let's add a stub page"
 * should have to argue with a test.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalSettingsPage } from '../GlobalSettingsPage';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'op@example.com' }, isBootstrap: true, signOut: vi.fn() }),
}));

vi.mock('../../../api/client', () => ({
  apiClient: { changePassword: vi.fn() },
}));

function mount(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/settings${search}`]}>
      <GlobalSettingsPage />
    </MemoryRouter>,
  );
}

describe('GlobalSettingsPage nav', () => {
  it('keeps the destinations that answer something', () => {
    mount();
    for (const id of ['profile', 'security', 'sessions', 'appearance']) {
      expect(screen.getByTestId(`global-settings-${id}`)).toBeInTheDocument();
    }
  });

  it('has no Modules duplicate and no Notifications placeholder', () => {
    mount();
    expect(screen.queryByTestId('global-settings-modules')).toBeNull();
    expect(screen.queryByTestId('global-settings-notifications')).toBeNull();
    expect(screen.queryByText(/Not available yet/i)).toBeNull();
    expect(screen.queryByText(/Workspace defaults/i)).toBeNull();
  });

  it('a stale ?section= link for a removed page falls back to Profile, not a blank pane', () => {
    mount('?section=notifications');
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });
});
