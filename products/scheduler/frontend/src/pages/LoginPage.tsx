/**
 * Login page — Supabase Auth UI front-end.
 *
 * Email / password form + Google SSO button. The Supabase JS client
 * owns session state; this component is a thin form. On success the
 * AuthGuard reacts to the new session and the redirect to ``/``
 * happens automatically — no router push needed here.
 *
 * In local-dev mode (no Supabase env vars), the page renders a banner
 * explaining the bypass and a button that just navigates home.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Button, Card } from '@scheduler/design-system';

interface FromState {
  from?: { pathname: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, authDisabled } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as FromState)?.from?.pathname ?? '/';

  // Already authenticated — skip the form entirely.
  if (session) {
    return <Navigate to={from} replace />;
  }

  if (authDisabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Card className="w-full max-w-md p-8 space-y-4">
          <h1 className="text-xl font-medium">Auth disabled</h1>
          <p className="text-sm text-muted-foreground">
            ``VITE_SUPABASE_URL`` and ``VITE_SUPABASE_ANON_KEY`` are not
            set, so the app is running in local-dev mode. Any user can
            access every tournament without signing in.
          </p>
          <Button onClick={() => navigate(from)}>Continue</Button>
        </Card>
      </div>
    );
  }

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
        return;
      }
      // Successful login: AuthProvider will see the session and the
      // AuthGuard will route us to ``from``.
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) return;
    setError(null);
    const redirectTo = `${window.location.origin}${from}`;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (err) setError(err.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <Card className="w-full max-w-md p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">ShuttleWorks</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <label className="block">
            <span className="text-sm text-muted-foreground">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full px-3 py-2 rounded border border-input bg-background text-foreground"
              disabled={submitting}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full px-3 py-2 rounded border border-input bg-background text-foreground"
              disabled={submitting}
            />
          </label>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wide text-muted-foreground">
            <span className="bg-card px-2">or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleLogin}
          className="w-full"
        >
          Continue with Google
        </Button>
      </Card>
    </div>
  );
}
