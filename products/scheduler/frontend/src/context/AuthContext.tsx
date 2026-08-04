/**
 * Auth context backed by the self-hosted cookie-session backend.
 *
 * ``AuthProvider`` probes ``GET /auth/me`` on mount and exposes
 * ``{ session, user, loading, authMode, isBootstrap, signOut, refresh }``
 * via ``useAuth()``.
 *
 * Semantics:
 * - Local mode: ``/auth/me`` always answers 200 with the bootstrap
 *   identity (``isBootstrap: true``), so the app behaves exactly as
 *   before — no login wall, the AuthGuard is a pass-through.
 * - Cloud mode: ``/auth/me`` answers 401 when signed out (mapped to
 *   ``null`` by ``apiClient.getMe``), so ``session`` is null and the
 *   AuthGuard redirects to ``/login``.
 * - ``session`` is a truthy ``{ user }`` object whenever a user is
 *   known — kept for consumers (AuthGuard, InvitePage) that check
 *   session truthiness rather than the user itself.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../api/client';
import type { UserDTO } from '../api/dto';

export interface AuthSession {
  user: UserDTO;
}

interface AuthContextValue {
  /** Truthy object when signed in (or bootstrap identity in local mode). */
  session: AuthSession | null;
  /** The resolved identity, or null when signed out in cloud mode. */
  user: UserDTO | null;
  /** True while the initial ``/auth/me`` probe is in flight. */
  loading: boolean;
  /** Backend auth mode. Defaults to 'local' until the first probe lands. */
  authMode: 'local' | 'cloud';
  /** True when the current identity is the local-mode bootstrap user. */
  isBootstrap: boolean;
  /** Clear the session cookie, then re-probe ``/auth/me`` (in local
   *  mode the probe hands back the bootstrap identity again). */
  signOut: () => Promise<void>;
  /** Re-run the ``/auth/me`` probe (e.g. after login/register). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    try {
      const me = await apiClient.getMe();
      setUser(me);
    } catch {
      // Network/server failure — treat as signed out rather than
      // crashing the shell; a retry happens on the next refresh().
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // SP-CLOUD-2: the api client broadcasts this when any request 401s
  // mid-session (expired/revoked cloud session). Re-probing maps the
  // dead session to ``user: null`` (cloud) so AuthGuard redirects to
  // /login on the next render; in local mode the probe simply hands
  // back the bootstrap identity, so the event is a harmless no-op.
  useEffect(() => {
    const onExpired = () => void refresh();
    window.addEventListener('sw:session-expired', onExpired);
    return () => window.removeEventListener('sw:session-expired', onExpired);
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      // Re-probe regardless: cloud mode lands on null (→ login wall);
      // local mode gets the bootstrap identity back.
      await refresh();
    }
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session: user ? { user } : null,
      user,
      loading,
      authMode: user?.authMode ?? 'local',
      isBootstrap: user?.isBootstrap ?? false,
      signOut,
      refresh,
    }),
    [user, loading, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth() called outside <AuthProvider>');
  }
  return ctx;
}
