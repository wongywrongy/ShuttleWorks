/**
 * AuthProvider — session semantics over the self-hosted cookie backend.
 * getMe() is the single probe: bootstrap identity (local), real account
 * (cloud), or null (401 signed-out).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: { getMe: vi.fn(), logout: vi.fn() },
}));

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
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getMe).mockReset();
    vi.mocked(apiClient.logout).mockReset();
    vi.mocked(apiClient.logout).mockResolvedValue(undefined as never);
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
});
