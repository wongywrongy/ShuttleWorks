/**
 * Auth context backed by the Supabase JS client.
 *
 * ``AuthProvider`` subscribes to ``supabase.auth.onAuthStateChange`` and
 * exposes ``{ session, user, loading, signOut }`` via ``useAuth()``.
 *
 * When the Supabase client is null (no env config — local dev /
 * pytest), a synthetic session + user is exposed immediately so the
 * AuthGuard and the rest of the app behave identically to the
 * configured path.
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
import type { Session, User } from '@supabase/supabase-js';
import { isAuthConfigured, supabase } from '../lib/supabase';

interface AuthContextValue {
  /** Active Supabase session, or a synthetic stand-in when auth is disabled. */
  session: Session | null;
  /** Resolved Supabase user, or a synthetic stand-in when auth is disabled. */
  user: User | null;
  /** True while the initial getSession() call is in flight. */
  loading: boolean;
  /** True when ``VITE_SUPABASE_URL`` / key are absent (local-dev mode). */
  authDisabled: boolean;
  /** Sign out via the Supabase client. No-op when auth is disabled. */
  signOut: () => Promise<void>;
}

const _SYNTHETIC_USER = {
  id: 'local-dev',
  email: 'local@dev',
} as unknown as User;

const _SYNTHETIC_SESSION = {
  user: _SYNTHETIC_USER,
} as unknown as Session;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(
    isAuthConfigured ? null : _SYNTHETIC_SESSION,
  );
  const [loading, setLoading] = useState<boolean>(isAuthConfigured);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    authDisabled: !isAuthConfigured,
    signOut,
  }), [session, loading, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth() called outside <AuthProvider>');
  }
  return ctx;
}
