import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionLockScreen } from '../SessionLockScreen';

const auth = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  refresh: vi.fn(),
  cancelReauthentication: vi.fn(),
}));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('../LoginPage', () => ({ LoginPage: ({ locked }: { locked?: boolean }) => <h1>{locked ? 'Sign in again' : 'Sign in'}</h1> }));
vi.mock('../../../api/client', () => ({ apiClient: { verifyMfa: vi.fn() } }));

const account = {
  id: 'operator', email: 'operator@example.test', displayName: null, emailVerified: true,
  isBootstrap: false, authMode: 'cloud', emailConfigured: false, passwordConfigured: true,
  mfaRequired: true, mfaEnforced: true, mfaAvailable: true, mfaEnrolled: true, mfaAuthenticated: true,
};

function lock(lockReason: 'expired' | 'reauth', user: unknown = account) {
  auth.value = { user, lockReason, refresh: auth.refresh, cancelReauthentication: auth.cancelReauthentication };
  return render(<SessionLockScreen />);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('session lock', () => {
  it('names itself as a modal dialog and keeps unsent work', () => {
    lock('reauth');
    expect(screen.getByRole('dialog', { name: 'Session verification' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('unsent changes are kept');
  });

  it('asks an enrolled operator to verify, never to enroll, and can be cancelled', async () => {
    const interact = userEvent.setup();
    lock('reauth');
    expect(screen.getByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create setup key' })).not.toBeInTheDocument();
    await interact.click(screen.getByRole('button', { name: 'Cancel verification' }));
    expect(auth.cancelReauthentication).toHaveBeenCalledOnce();
  });

  it('Escape dismisses a verification prompt', () => {
    lock('reauth');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(auth.cancelReauthentication).toHaveBeenCalledOnce();
  });

  it('an expired session cannot be dismissed and asks for sign-in', () => {
    lock('expired');
    expect(screen.getByRole('heading', { name: 'Sign in again' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(auth.cancelReauthentication).not.toHaveBeenCalled();
  });

  it('the local bootstrap identity only needs to reconnect', async () => {
    const interact = userEvent.setup();
    lock('expired', { ...account, isBootstrap: true });
    await interact.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(auth.refresh).toHaveBeenCalledOnce();
  });
});
