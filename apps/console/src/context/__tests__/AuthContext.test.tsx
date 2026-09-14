/**
 * AuthProvider — session semantics over the self-hosted cookie backend.
 * getMe() is the single probe: bootstrap identity (local), real account
 * (cloud), or null (401 signed-out).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext';
import { apiClient } from '../../api/client';
import { AuthGuard } from '../../app/AuthGuard';
import { leaveAuthenticatedView } from '../../lib/sessionNavigation';

vi.mock('../../api/client', () => ({
  apiClient: { getMe: vi.fn(), logout: vi.fn(), setAuthWorkspaceId: vi.fn(), recordAuthActivity: vi.fn(),
    login: vi.fn(), verifyMfa: vi.fn(), beginMfa: vi.fn(), confirmMfa: vi.fn() },
}));
vi.mock('../../lib/sessionNavigation', () => ({ leaveAuthenticatedView: vi.fn() }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const bootstrapUser = {
  id: 'u-local',
  email: 'local@dev',
  displayName: null,
  emailVerified: false,
  isBootstrap: true,
  authMode: 'local' as const,
};

const accountUser = {
  id: 'u-1',
  email: 'director@club.org',
  displayName: 'Director',
  emailVerified: true,
  isBootstrap: false,
  authMode: 'cloud' as const,
  emailConfigured: false,
  passwordConfigured: true,
  mfaRequired: true,
  mfaEnrolled: true,
  mfaAuthenticated: true,
  authenticatedAt: '2026-09-14T10:00:00Z',
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getMe).mockReset();
    vi.mocked(apiClient.logout).mockReset();
    vi.mocked(apiClient.recordAuthActivity).mockReset();
    vi.mocked(apiClient.logout).mockResolvedValue(undefined as never);
    vi.mocked(apiClient.recordAuthActivity).mockResolvedValue(undefined);
  });

  it('background probes and synthetic input never count as human activity', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiClient.getMe).mockResolvedValue(accountUser);
      const { unmount } = renderHook(() => useAuth(), { wrapper });
      await act(async () => { await Promise.resolve(); });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        document.dispatchEvent(new Event('pointerdown'));
      });
      expect(apiClient.getMe).toHaveBeenCalledTimes(4);
      expect(apiClient.recordAuthActivity).not.toHaveBeenCalled();
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('records trusted input once per minute and stops recording when the session locks', async () => {
    const subscribe = vi.spyOn(document, 'addEventListener');
    const time = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser);
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    try {
      await waitFor(() => expect(result.current.loading).toBe(false));
      const activity = subscribe.mock.calls.find(([name]) => name === 'keydown')?.[1] as EventListener;
      expect(activity).toBeTypeOf('function');
      await act(async () => { activity({ isTrusted: true } as Event); });
      await act(async () => { activity({ isTrusted: true } as Event); });
      expect(apiClient.recordAuthActivity).toHaveBeenCalledTimes(1);
      time.mockReturnValue(61_000);
      await act(async () => { activity({ isTrusted: true } as Event); });
      expect(apiClient.recordAuthActivity).toHaveBeenCalledTimes(2);
      vi.mocked(apiClient.getMe).mockResolvedValue(null);
      await act(async () => { await result.current.refresh(); });
      time.mockReturnValue(121_000);
      await act(async () => { activity({ isTrusted: true } as Event); });
      expect(apiClient.recordAuthActivity).toHaveBeenCalledTimes(2);
    } finally { unmount(); subscribe.mockRestore(); time.mockRestore(); }
  });

  it('ignores an older identity reply after a newer probe locks the session', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValueOnce(accountUser);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let oldReply!: (user: typeof accountUser) => void;
    vi.mocked(apiClient.getMe).mockImplementationOnce(() => new Promise(resolve => { oldReply = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = result.current.refresh(); });
    vi.mocked(apiClient.getMe).mockResolvedValueOnce(null);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.lockReason).toBe('expired');
    await act(async () => { oldReply(accountUser); await pending; });
    expect(result.current.session).toBeNull();
    expect(result.current.lockReason).toBe('expired');
  });

  it('local mode: exposes the bootstrap identity with a truthy session', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(bootstrapUser as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(bootstrapUser);
    expect(result.current.session).toEqual({ user: bootstrapUser });
    expect(result.current.isBootstrap).toBe(true);
    expect(result.current.authMode).toBe('local');
  });

  it('cloud mode signed in: exposes the account user', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(accountUser);
    expect(result.current.isBootstrap).toBe(false);
    expect(result.current.authMode).toBe('cloud');
  });

  it('cloud mode signed out: getMe null (401) -> no session, defaults', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(null as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.isBootstrap).toBe(false);
    expect(result.current.authMode).toBe('local'); // pre-identity default
  });

  it('network failure on the probe is treated as signed out, not a crash', async () => {
    vi.mocked(apiClient.getMe).mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('signOut calls logout then re-probes (local mode gets bootstrap back)', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(bootstrapUser as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(apiClient.logout).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiClient.getMe).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current.user).toEqual(bootstrapUser);
  });

  it('sw:session-expired re-probes and nulls the session (cloud expiry)', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).not.toBeNull());
    // Mid-session, some request 401s → the api client broadcasts this
    // event; the provider must re-probe and drop the dead session.
    vi.mocked(apiClient.getMe).mockResolvedValue(null as never);
    act(() => {
      window.dispatchEvent(new CustomEvent('sw:session-expired'));
    });
    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.user).toEqual(accountUser);
    expect(result.current.lockReason).toBe('expired');
  });

  it('a password-only response is pending and never becomes a console session', async () => {
    const pending = { ...accountUser, mfaAuthenticated: false, authenticatedAt: null };
    vi.mocked(apiClient.getMe).mockResolvedValue(pending);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.pendingUser).toEqual(pending);
  });

  it('a background probe cannot dismiss a required fresh-authentication prompt', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).not.toBeNull());
    act(() => { window.dispatchEvent(new CustomEvent('sw:reauth-required')); });
    await act(() => result.current.refresh());
    expect(result.current.lockReason).toBe('reauth');
    vi.mocked(apiClient.getMe).mockResolvedValue({ ...accountUser, authenticatedAt: '2026-09-14T10:06:00Z' });
    await act(() => result.current.refresh());
    expect(result.current.lockReason).toBeNull();
  });

  it('a different identity leaves the private view instead of resuming its drafts', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).not.toBeNull());
    vi.mocked(apiClient.getMe).mockResolvedValue({ ...accountUser, id: 'another-operator' });
    await act(() => result.current.refresh());
    expect(leaveAuthenticatedView).toHaveBeenCalledTimes(1);
    expect(result.current.session).toBeNull();
    expect(result.current.user?.id).toBe(accountUser.id);
    expect(result.current.lockReason).toBe('expired');
  });

  it('cancel cannot dismiss an expired session', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).not.toBeNull());
    vi.mocked(apiClient.getMe).mockResolvedValue(null);
    await act(() => result.current.refresh());
    act(() => result.current.cancelReauthentication());
    expect(result.current.lockReason).toBe('expired');
  });

  it('keeps a mounted unsent draft through password and MFA reauthentication', async () => {
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser);
    const unmounted = vi.fn();
    function Draft() {
      const [value, setValue] = React.useState('');
      React.useEffect(() => () => unmounted(), []);
      return <label>Unsent draft<input value={value} onChange={(event) => setValue(event.target.value)} /></label>;
    }
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/tournaments/example/settings?panel=roster#draft']}>
      <AuthProvider><AuthGuard><Draft /></AuthGuard></AuthProvider>
    </MemoryRouter>);
    const input = await screen.findByLabelText('Unsent draft');
    await user.type(input, 'Keep this unsent change');
    vi.mocked(apiClient.getMe).mockResolvedValue(null);
    act(() => { window.dispatchEvent(new CustomEvent('sw:session-expired')); });
    await screen.findByRole('dialog', { name: 'Session verification' });
    await screen.findByRole('button', { name: 'Sign in' });
    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
    expect(unmounted).not.toHaveBeenCalled();
    vi.mocked(apiClient.login).mockResolvedValue({ ...accountUser, mfaAuthenticated: false, authenticatedAt: null });
    await user.type(screen.getByLabelText('Password', { exact: true }), 'the private password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(await screen.findByLabelText('Authenticator or recovery code'), '123456');
    vi.mocked(apiClient.verifyMfa).mockResolvedValue(accountUser);
    vi.mocked(apiClient.getMe).mockResolvedValue(accountUser);
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(input).toBeVisible();
    expect(input).toHaveValue('Keep this unsent change');
    expect(unmounted).not.toHaveBeenCalled();
  });
});
