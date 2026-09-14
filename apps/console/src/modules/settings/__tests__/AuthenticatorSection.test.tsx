import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthenticatorSection } from '../AuthenticatorSection';
import { apiClient } from '../../../api/client';
import type { UserDTO } from '../../../api/dto';

const refresh = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ refresh }) }));
vi.mock('../../../api/client', () => ({
  apiClient: {
    requireFreshAuthentication: vi.fn(), reissueRecoveryCodes: vi.fn(), disableMfa: vi.fn(),
    beginMfa: vi.fn(), confirmMfa: vi.fn(), verifyMfa: vi.fn(),
  },
}));

const base: UserDTO = {
  id: 'operator', email: 'operator@example.test', displayName: null, emailVerified: true,
  isBootstrap: false, authMode: 'local', emailConfigured: false, passwordConfigured: true,
  mfaRequired: false, mfaEnforced: false, mfaAvailable: true, mfaEnrolled: false, mfaAuthenticated: false,
};
const enrolled: UserDTO = { ...base, mfaRequired: true, mfaEnrolled: true, mfaAuthenticated: true, mfaRecoveryCodesRemaining: 6 };
const CODES = Array.from({ length: 8 }, (_, i) => `code-${i}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.requireFreshAuthentication).mockResolvedValue(undefined);
});

describe('authenticator settings', () => {
  it('explains when this server cannot offer an authenticator', () => {
    render(<AuthenticatorSection user={{ ...base, mfaAvailable: false }} />);
    expect(screen.getByText(/not configured on this server/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up an authenticator' })).not.toBeInTheDocument();
  });

  it('offers voluntary setup where policy does not require it', async () => {
    const interact = userEvent.setup();
    render(<AuthenticatorSection user={base} />);
    await interact.click(screen.getByRole('button', { name: 'Set up an authenticator' }));
    expect(apiClient.requireFreshAuthentication).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Set up an authenticator' })).toBeInTheDocument();
  });

  it('never offers turning off a required authenticator', () => {
    render(<AuthenticatorSection user={{ ...enrolled, mfaEnforced: true }} />);
    expect(screen.getByText(/requires an authenticator/)).toBeInTheDocument();
    expect(screen.getByText(/6 of 8 recovery codes remain/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off authenticator' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace authenticator' })).toBeInTheDocument();
  });

  it('warns when recovery codes run low', () => {
    render(<AuthenticatorSection user={{ ...enrolled, mfaRecoveryCodesRemaining: 1 }} />);
    expect(screen.getByText(/running low on recovery codes/)).toBeInTheDocument();
  });

  it('issues new recovery codes from a current authenticator code and shows them once', async () => {
    const interact = userEvent.setup();
    vi.mocked(apiClient.reissueRecoveryCodes).mockResolvedValue({ recoveryCodes: CODES });
    render(<AuthenticatorSection user={enrolled} />);
    await interact.click(screen.getByRole('button', { name: 'Issue new recovery codes' }));
    await interact.type(await screen.findByLabelText('Current password'), 'private password');
    await interact.type(screen.getByLabelText('Authenticator code'), '123456');
    await interact.click(screen.getByRole('button', { name: 'Issue new recovery codes' }));
    expect(apiClient.reissueRecoveryCodes).toHaveBeenCalledExactlyOnceWith('private password', '123456');
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toHaveTextContent('code-7');
    await interact.click(screen.getByRole('button', { name: 'I have saved my codes' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument();
  });

  it('turns off a voluntary authenticator only on the confirming second press', async () => {
    const interact = userEvent.setup();
    vi.mocked(apiClient.disableMfa).mockResolvedValue({ ...base });
    render(<AuthenticatorSection user={enrolled} />);
    await interact.click(screen.getByRole('button', { name: 'Turn off authenticator' }));
    await interact.type(await screen.findByLabelText('Current password'), 'private password');
    await interact.type(screen.getByLabelText('Authenticator or recovery code'), '123456');
    await interact.click(screen.getByRole('button', { name: 'Turn off authenticator' }));
    expect(apiClient.disableMfa).not.toHaveBeenCalled();
    await interact.click(screen.getByRole('button', { name: 'Confirm: turn off authenticator' }));
    await waitFor(() => expect(apiClient.disableMfa).toHaveBeenCalledExactlyOnceWith('private password', '123456'));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText('Authenticator turned off.')).toBeInTheDocument();
  });

  it('a cancelled verification opens nothing and reports no error', async () => {
    const interact = userEvent.setup();
    vi.mocked(apiClient.requireFreshAuthentication).mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'AUTH_REAUTH_CANCELLED' }));
    render(<AuthenticatorSection user={enrolled} />);
    await interact.click(screen.getByRole('button', { name: 'Replace authenticator' }));
    await waitFor(() => expect(apiClient.requireFreshAuthentication).toHaveBeenCalledOnce());
    expect(screen.queryByRole('heading', { name: 'Replace your authenticator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
