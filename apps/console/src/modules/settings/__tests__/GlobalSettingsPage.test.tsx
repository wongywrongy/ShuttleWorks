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
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalSettingsPage } from '../GlobalSettingsPage';
import { SHELL_RAIL_MIN_WIDTH } from '../../../platform/product-shell/WorkspaceShell';

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

const DEFAULT_WIDTH = window.innerWidth;

function setViewport(width: number) {
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  window.innerWidth = DEFAULT_WIDTH;
});

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

  it('collapses the secondary rail into a full-width selector below the shell breakpoint', () => {
    window.innerWidth = 390;
    mount();
    expect(screen.getByTestId('global-settings-select')).toHaveClass('w-full');
    expect(screen.queryByRole('navigation', { name: 'Account sections' })).not.toBeInTheDocument();
  });

  it('restores the persistent rail at the shared shell breakpoint', () => {
    window.innerWidth = 390;
    mount();
    expect(screen.getByTestId('global-settings-select')).toBeInTheDocument();
    setViewport(SHELL_RAIL_MIN_WIDTH);
    expect(screen.getByRole('navigation', { name: 'Account sections' })).toBeInTheDocument();
    expect(screen.queryByTestId('global-settings-select')).not.toBeInTheDocument();
  });
});
