/** Server-backed identity with a lock that retains the last user's unsent drafts. */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../api/client';
import type { UserDTO } from '../api/dto';
import { leaveAuthenticatedView } from '../lib/sessionNavigation';
import { rememberNodeWorkspace } from '../lib/nodeWorkspace';

export interface AuthSession { user: UserDTO }
export type AuthLockReason = 'expired' | 'reauth' | null;

interface AuthContextValue {
  session: AuthSession | null;
  /** While locked, this is the last authenticated identity, for retained forms. */
  user: UserDTO | null;
  pendingUser: UserDTO | null;
  lockReason: AuthLockReason;
  loading: boolean;
  authMode: 'local' | 'cloud';
  isBootstrap: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  cancelReauthentication: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthenticated(user: UserDTO | null): user is UserDTO {
  return !!user && (user.isBootstrap || user.mfaRequired === false || user.mfaAuthenticated === true);
}

export function AuthProvider({ children, workspaceId }: { children: ReactNode; workspaceId?: string }) {
  const [identity, setIdentity] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockReason, setLockReason] = useState<AuthLockReason>(null);
  const [rememberedUser, setRememberedUser] = useState<UserDTO | null>(null);
  const remembered = useRef<UserDTO | null>(null);
  const lock = useRef<AuthLockReason>(null);
  const current = useRef<UserDTO | null>(null);
  const generation = useRef(0);
  useEffect(() => { current.current = identity; }, [identity]);

  const setLock = useCallback((reason: AuthLockReason) => {
    lock.current = reason;
    setLockReason(reason);
  }, []);

  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    apiClient.setAuthWorkspaceId(workspaceId);
    try {
      const me = await apiClient.getMe();
      if (generation.current !== requestGeneration) return;
      const previous = remembered.current;
      if (isAuthenticated(me)) {
        if (previous && previous.id !== me.id) {
          // A different identity must never inherit this tab's private stores.
          setIdentity(null);
          setLock('expired');
          leaveAuthenticatedView(me.offlineWorkspaceId ?? undefined);
          return;
        }
        if (me.offlineWorkspaceId) rememberNodeWorkspace(me.offlineWorkspaceId);
        const same = previous && JSON.stringify(previous) === JSON.stringify(me) ? previous : me;
        const mayResume = lock.current !== 'reauth'
          || (!!me.authenticatedAt && me.authenticatedAt !== previous?.authenticatedAt);
        const wasLocked = lock.current !== null;
        remembered.current = same;
        setRememberedUser(same);
        setIdentity(same);
        if (mayResume) {
          setLock(null);
          if (wasLocked) window.dispatchEvent(new CustomEvent('sw:session-restored'));
        }
      } else {
        setIdentity(me);
        if (previous) setLock('expired');
      }
    } catch {
      if (generation.current !== requestGeneration) return;
      setIdentity(null);
      if (remembered.current) setLock('expired');
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [workspaceId, setLock]);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  useEffect(() => {
    const expired = () => {
      if (remembered.current) setLock('expired');
      void refresh();
    };
    const reauthenticate = () => {
      if (remembered.current) setLock('reauth');
      else void refresh();
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('sw:session-expired', expired);
    window.addEventListener('sw:reauth-required', reauthenticate);
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    // This read detects server-side expiry; it never records activity.
    const timer = window.setInterval(visible, 60_000);
    return () => {
      window.removeEventListener('sw:session-expired', expired);
      window.removeEventListener('sw:reauth-required', reauthenticate);
      window.removeEventListener('online', visible);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, [refresh, setLock]);

  useEffect(() => {
    let lastRecorded = -Infinity;
    let recording = false;
    let cancelled = false;
    const activity = (event: Event) => {
      const me = current.current;
      const now = Date.now();
      if (!event.isTrusted || document.hidden || !isAuthenticated(me) || me.isBootstrap
        || lock.current === 'expired' || recording || now - lastRecorded < 60_000) return;
      recording = true;
      lastRecorded = now;
      void apiClient.recordAuthActivity().catch(() => {
        // The API interceptor reports a dead session; a network failure is
        // retried by the next real interaction, never by a background write.
      }).finally(() => { if (!cancelled) recording = false; });
    };
    document.addEventListener('pointerdown', activity, { passive: true });
    document.addEventListener('keydown', activity, { passive: true });
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
    };
  }, []);

  const signOut = useCallback(async () => {
    await apiClient.logout();
    generation.current += 1;
    if (remembered.current?.isBootstrap) {
      await refresh();
      return;
    }
    const offlineWorkspaceId = remembered.current?.offlineWorkspaceId;
    remembered.current = null;
    setRememberedUser(null);
    setIdentity(null);
    setLock(null);
    leaveAuthenticatedView(offlineWorkspaceId ?? undefined);
  }, [refresh, setLock]);

  const user = isAuthenticated(identity) ? identity : rememberedUser ?? identity;
  const cancelReauthentication = useCallback(() => {
    if (lock.current === 'reauth' && isAuthenticated(current.current)) {
      setLock(null);
      // Requests waiting on this verification (withFreshProof) give up.
      window.dispatchEvent(new CustomEvent('sw:reauth-cancelled'));
    }
  }, [setLock]);
  const value = useMemo<AuthContextValue>(() => ({
    session: isAuthenticated(identity) ? { user: identity } : null,
    user,
    pendingUser: identity && !isAuthenticated(identity) ? identity : null,
    lockReason,
    loading,
    authMode: user?.authMode ?? 'local',
    isBootstrap: user?.isBootstrap ?? false,
    signOut,
    refresh,
    cancelReauthentication,
  }), [identity, user, lockReason, loading, signOut, refresh, cancelReauthentication]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error('useAuth() called outside <AuthProvider>');
  return context;
}
