/**
 * LoginPage — the password-setting contract.
 *
 * These lock the design-review fixes: a confirm field on every
 * password-setting flow, the policy stated before submission, and server
 * failures anchored to the field that caused them (not a form-footer blob).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage, returnDestination } from '../LoginPage';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    register: vi.fn(),
    login: vi.fn(),
    resetPassword: vi.fn(),
    requestPasswordReset: vi.fn(),
  },
}));

// Signed-out: the form renders instead of redirecting.
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ session: null, refresh: vi.fn() }),
}));

function renderAt(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.register).mockReset();
    vi.mocked(apiClient.login).mockReset();
    vi.mocked(apiClient.resetPassword).mockReset();
  });

  it('preserves query and hash in the auth return destination', () => {
    expect(
      returnDestination({ from: { pathname: '/tournaments/t1/participants', search: '?view=issues', hash: '#selected' } }),
    ).toBe('/tournaments/t1/participants?view=issues#selected');
    expect(returnDestination({ from: { pathname: 'https://example.com/phish' } })).toBe('/');
  });

  it('sign-in mode asks for a password once and states no policy', async () => {
    renderAt();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    expect(screen.queryByText(/At least 8 characters/)).not.toBeInTheDocument();
  });

  it('create-account mode confirms the password and states the policy up front', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '8');
  });

  it('blocks submission and anchors the error when the passwords differ', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await user.type(screen.getByLabelText('Email'), 'director@club.org');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.type(screen.getByLabelText('Confirm password'), 'correct-hoarse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(apiClient.register).not.toHaveBeenCalled();
    // Anchored: the confirm input is the invalid one.
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
  });

  it('registers when the passwords match', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.register).mockResolvedValue(undefined as never);
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await user.type(screen.getByLabelText('Email'), 'director@club.org');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.type(screen.getByLabelText('Confirm password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(apiClient.register).toHaveBeenCalledWith({
        email: 'director@club.org',
        password: 'correct-horse',
        displayName: undefined,
      }),
    );
  });

  it('anchors a weak-password rejection to the password field', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.register).mockRejectedValue(
      Object.assign(new Error('Password must be at least 8 characters'), {
        code: 'AUTH_WEAK_PASSWORD',
      }),
    );
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email'), 'director@club.org');
    await user.type(screen.getByLabelText('Password'), 'shortpw1');
    await user.type(screen.getByLabelText('Confirm password'), 'shortpw1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('the reset form confirms the new password too', async () => {
    const user = userEvent.setup();
    renderAt('/login?reset=tok-123');

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();

    await user.type(screen.getByLabelText('New password'), 'correct-horse');
    await user.type(screen.getByLabelText('Confirm new password'), 'correct-hoarse');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(apiClient.resetPassword).not.toHaveBeenCalled();
  });

  it('a password field can be revealed', async () => {
    const user = userEvent.setup();
    renderAt();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });
});
