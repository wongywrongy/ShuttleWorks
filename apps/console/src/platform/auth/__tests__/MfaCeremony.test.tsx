import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaCeremony } from '../MfaCeremony';
import { apiClient } from '../../../api/client';
import type { UserDTO } from '../../../api/dto';

vi.mock('../../../api/client', () => ({ apiClient: { beginMfa: vi.fn(), confirmMfa: vi.fn(), verifyMfa: vi.fn() } }));
const user: UserDTO = {
  id: 'operator-1', email: 'operator@example.test', displayName: null, emailVerified: true,
  isBootstrap: false, authMode: 'cloud', emailConfigured: false, passwordConfigured: true,
  mfaRequired: true, mfaEnforced: true, mfaAvailable: true, mfaEnrolled: false, mfaAuthenticated: false,
};
beforeEach(() => { vi.clearAllMocks(); });

describe('authenticator ceremony', () => {
  it.each([false, true])('keeps issue-once recovery codes visible until acknowledgement (replacement: %s)', async (replace) => {
    const interact = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    vi.mocked(apiClient.beginMfa).mockResolvedValue({ secret: 'PRIVATE-SETUP-KEY', expiresAt: '2026-09-14T12:00:00Z', issuer: 'ShuttleWorks' });
    vi.mocked(apiClient.confirmMfa).mockResolvedValue({ user: { ...user, mfaEnrolled: true, mfaAuthenticated: true }, recoveryCodes: ['private-recovery-one', 'private-recovery-two'] });
    render(<MfaCeremony user={{ ...user, mfaEnrolled: replace }} mode={replace ? 'replace' : 'enroll'} initialPassword="private password" onComplete={onComplete} />);
    await interact.click(screen.getByRole('button', { name: 'Create setup key' }));
    expect(await screen.findByLabelText('Authenticator setup key')).toHaveTextContent('PRIVATE-SETUP-KEY');
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    await interact.type(screen.getByLabelText('Authenticator code'), '123456');
    await interact.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toHaveTextContent('private-recovery-one');
    expect(screen.queryByText('PRIVATE-SETUP-KEY')).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(apiClient.confirmMfa).toHaveBeenCalledExactlyOnceWith('123456');
    await interact.click(screen.getByRole('button', { name: 'I have saved my codes' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
  });

  it('a rejected code leaves verification pending and allows a corrected proof', async () => {
    const interact = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    vi.mocked(apiClient.verifyMfa).mockRejectedValueOnce(new Error('Invalid authenticator proof')).mockResolvedValue({ ...user, mfaAuthenticated: true });
    render(<MfaCeremony user={{ ...user, mfaEnrolled: true }} mode="verify" initialPassword="private password" onComplete={onComplete} />);
    const field = screen.getByLabelText('Authenticator or recovery code');
    await interact.type(field, '000000');
    await interact.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid authenticator proof');
    expect(onComplete).not.toHaveBeenCalled();
    await interact.clear(field);
    await interact.type(field, '123456');
    await interact.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(apiClient.verifyMfa).toHaveBeenLastCalledWith('private password', '123456');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(field).toHaveValue('');
  });

  it('verify mode never turns a re-authentication into enrollment', () => {
    render(<MfaCeremony user={{ ...user, mfaEnrolled: false }} mode="verify" onComplete={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument();
    expect(screen.getByLabelText('Authenticator or recovery code')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create setup key' })).not.toBeInTheDocument();
  });

  it('start over discards an expired setup key and asks for the password again', async () => {
    const interact = userEvent.setup();
    vi.mocked(apiClient.beginMfa).mockResolvedValue({ secret: 'FIRST-KEY', expiresAt: '2026-09-14T12:00:00Z', issuer: 'ShuttleWorks' });
    vi.mocked(apiClient.confirmMfa).mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 'AUTH_MFA_INVALID' }));
    render(<MfaCeremony user={user} mode="enroll" initialPassword="private password" onComplete={vi.fn()} />);
    await interact.click(screen.getByRole('button', { name: 'Create setup key' }));
    await interact.type(await screen.findByLabelText('Authenticator code'), '123456');
    await interact.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code was not accepted');
    await interact.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.queryByText('FIRST-KEY')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create setup key' })).toBeEnabled();
  });

  it('explains an unavailable authenticator service instead of a raw server string', async () => {
    const interact = userEvent.setup();
    vi.mocked(apiClient.beginMfa).mockRejectedValue(Object.assign(new Error('Authenticator service is unavailable'), { code: 'AUTH_MFA_UNAVAILABLE' }));
    render(<MfaCeremony user={user} mode="enroll" initialPassword="private password" onComplete={vi.fn()} />);
    await interact.click(screen.getByRole('button', { name: 'Create setup key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable on this server right now');
  });
});
