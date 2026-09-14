import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NodeEnrollmentPage } from '../NodeEnrollmentPage';
import { apiClient } from '../../../api/client';

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ pendingUser: null, refresh: vi.fn() }) }));
vi.mock('../../../api/client', () => ({ apiClient: { activateNodeOperator: vi.fn() } }));
const workspaceId = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { vi.clearAllMocks(); });

describe('individual node enrollment', () => {
  it('requires an explicit workspace address before collecting credentials', () => {
    render(<MemoryRouter initialEntries={['/node-enrollment']}><NodeEnrollmentPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('enrollment address');
    expect(screen.queryByLabelText('Activation token')).not.toBeInTheDocument();
    expect(apiClient.activateNodeOperator).not.toHaveBeenCalled();
  });

  it('submits a private activation credential and proceeds to authenticator setup', async () => {
    const interact = userEvent.setup();
    vi.mocked(apiClient.activateNodeOperator).mockResolvedValue({
      id: 'operator', email: 'node@example.test', displayName: null, emailVerified: false,
      isBootstrap: false, authMode: 'local', emailConfigured: false, passwordConfigured: true,
      mfaRequired: true, mfaEnforced: true, mfaAvailable: true, mfaEnrolled: false, mfaAuthenticated: false, offlineWorkspaceId: workspaceId,
    });
    render(<MemoryRouter initialEntries={[`/node-enrollment?workspaceId=${workspaceId}`]}><NodeEnrollmentPage /></MemoryRouter>);
    await interact.type(screen.getByLabelText('Email'), 'node@example.test');
    await interact.type(screen.getByLabelText('Activation token', { exact: true }), 'private-once-token');
    await interact.type(screen.getByLabelText('Node password', { exact: true }), 'a node password');
    await interact.type(screen.getByLabelText('Confirm node password'), 'a node password');
    await interact.click(screen.getByRole('button', { name: 'Continue to authenticator setup' }));
    expect(await screen.findByRole('heading', { name: 'Set up an authenticator' })).toBeInTheDocument();
    expect(apiClient.activateNodeOperator).toHaveBeenCalledExactlyOnceWith({
      workspaceId, email: 'node@example.test', activationToken: 'private-once-token', newPassword: 'a node password',
    });
    expect(screen.queryByLabelText('Activation token', { exact: true })).not.toBeInTheDocument();
  });
});
