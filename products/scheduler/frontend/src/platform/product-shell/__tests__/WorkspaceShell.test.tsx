import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceShell } from '../WorkspaceShell';
import type { WorkspaceIdentity } from '../types';
import { modulesForWorkspace } from '../../domain/moduleModel';

const identity: WorkspaceIdentity = {
  name: 'Spring Finals',
  date: '2026-04-01',
  status: 'active',
  kind: 'meet',
};

const base = {
  modules: modulesForWorkspace('meet'),
  tid: 't1',
  kind: 'meet' as const,
  activeTab: 'overview' as const,
  adminActive: false,
  onOpenAdmin: () => {},
  onBackToHub: () => {},
};

function renderShell(props: Partial<React.ComponentProps<typeof WorkspaceShell>> = {}) {
  return render(
    <MemoryRouter>
      <WorkspaceShell identity={identity} {...base} {...props}>
        <div data-testid="content">content</div>
      </WorkspaceShell>
    </MemoryRouter>,
  );
}

describe('WorkspaceShell', () => {
  it('shows identity, status, the workspace sidebar, status slot and children', () => {
    renderShell({ statusSlot: <span data-testid="chip">chip</span> });
    expect(screen.getByText('Spring Finals')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    // The left workspace sidebar (Overview always present) replaces the dock.
    expect(screen.getByTestId('ws-nav-overview')).toBeInTheDocument();
    expect(screen.getByTestId('chip')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('omits the status pill when status is null and shows a name fallback', () => {
    renderShell({ identity: { name: null, date: null, status: null, kind: 'meet' } });
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('fires onBackToHub from the back control', async () => {
    const onBackToHub = vi.fn();
    renderShell({ onBackToHub });
    await userEvent.click(screen.getByLabelText('Back to workspaces'));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it('the admin gear fires onOpenAdmin and reflects adminActive', async () => {
    const onOpenAdmin = vi.fn();
    renderShell({ onOpenAdmin, adminActive: true });
    const gear = screen.getByTestId('workspace-admin-gear');
    expect(gear).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(gear);
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
  });
});
