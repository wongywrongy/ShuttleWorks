import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceShell } from '../WorkspaceShell';
import type { WorkspaceIdentity } from '../types';
import { modulesForWorkspace } from '../../domain/moduleModel';

const identity: WorkspaceIdentity = {
  name: 'Spring Finals',
  date: '2026-04-01',
  status: 'active',
  kind: 'meet',
};

describe('WorkspaceShell', () => {
  it('shows identity, status, module dock, status slot and children', () => {
    render(
      <WorkspaceShell
        identity={identity}
        modules={modulesForWorkspace('meet')}
        activeModule="meet"
        onSelectModule={() => {}}
        onBackToHub={() => {}}
        statusSlot={<span data-testid="chip">chip</span>}
      >
        <div data-testid="content">content</div>
      </WorkspaceShell>,
    );
    expect(screen.getByText('Spring Finals')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByTestId('module-meet')).toBeInTheDocument();
    expect(screen.getByTestId('chip')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('omits the status pill when status is null and shows a name fallback', () => {
    render(
      <WorkspaceShell
        identity={{ name: null, date: null, status: null, kind: 'meet' }}
        modules={modulesForWorkspace('meet')}
        activeModule="meet"
        onSelectModule={() => {}}
        onBackToHub={() => {}}
      >
        <div />
      </WorkspaceShell>,
    );
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('fires onBackToHub from the back control', async () => {
    const onBackToHub = vi.fn();
    render(
      <WorkspaceShell
        identity={identity}
        modules={modulesForWorkspace('meet')}
        activeModule="meet"
        onSelectModule={() => {}}
        onBackToHub={onBackToHub}
      >
        <div />
      </WorkspaceShell>,
    );
    await userEvent.click(screen.getByLabelText('Back to workspaces'));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });
});
