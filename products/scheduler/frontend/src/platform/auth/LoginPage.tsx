/**
 * Login page — self-hosted email + password auth.
 *
 * Four modes on one card:
 *   - Sign in (default) / Create account (toggle) — on success we
 *     ``refresh()`` the AuthContext and navigate to the ``from``
 *     location the AuthGuard stashed.
 *   - Forgot password — requests a reset email (always 202; no
 *     account-existence oracle) and shows an info message.
 *   - ``?reset=<token>`` in the URL — set-new-password form that calls
 *     ``resetPassword`` then returns to the plain ``/login``.
 *
 * In local mode the bootstrap session is already present, so the page
 * redirects away exactly as before — no login wall.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Button, Card } from '@scheduler/design-system';

interface FromState {
  from?: { pathname: string };
}

type Mode = 'signin' | 'register' | 'forgot';

const INPUT_CLASS =
  'mt-1 w-full px-3 py-2 rounded border border-input bg-background text-foreground';

/** Human message for an auth failure, preferring the structured code. */
function authErrorMessage(err: unknown): string {
  const e = err as {
    code?: string;
    message?: string;
    response?: { data?: { detail?: { retryAfterSeconds?: number } } };
  };
  if (e.code === 'AUTH_THROTTLED') {
    const secs = e.response?.data?.detail?.retryAfterSeconds;
    return secs
      ? `Too many attempts — try again in ${secs}s.`
      : 'Too many attempts — try again shortly.';
  }
  if (e.code === 'AUTH_INVALID_CREDENTIALS') return 'Invalid email or password.';
  return e.message || 'Something went wrong. Please try again.';
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { session, refresh } = useAuth();

  const resetToken = searchParams.get('reset');

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const from = (location.state as FromState)?.from?.pathname ?? '/';

  // ---- ?reset=<token>: set-new-password form -------------------------
  // Takes precedence over the session redirect so a signed-in browser
  // can still complete a reset link it was mailed.
  if (resetToken) {
    const handleReset = async (e: FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        await apiClient.resetPassword(resetToken, newPassword);
        navigate('/login', { replace: true });
      } catch (err) {
        setError(authErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Card className="w-full max-w-md p-8 space-y-5">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">ShuttleWorks</h1>
            <p className="text-sm text-muted-foreground mt-1">Choose a new password</p>
          </div>
          <form onSubmit={handleReset} className="space-y-3">
            <label className="block">
              <FieldLabel>New password</FieldLabel>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={INPUT_CLASS}
                disabled={submitting}
              />
            </label>
            {error && <div className="text-sm text-status-danger-fg">{error}</div>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Already authenticated (incl. the local-mode bootstrap session) —
  // skip the form entirely.
  if (session) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'forgot') {
        await apiClient.requestPasswordReset(email);
        setInfo('If an account exists for that address, a reset link is on its way.');
        return;
      }
      if (mode === 'register') {
        await apiClient.register({
          email,
          password,
          displayName: displayName.trim() || undefined,
        });
      } else {
        await apiClient.login({ email, password });
      }
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <Card className="w-full max-w-md p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">ShuttleWorks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'signin' && 'Sign in to continue'}
            {mode === 'register' && 'Create your account'}
            {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <label className="block">
              <FieldLabel>Display name (optional)</FieldLabel>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                className={INPUT_CLASS}
                disabled={submitting}
              />
            </label>
          )}
          <label className="block">
            <FieldLabel>Email</FieldLabel>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={INPUT_CLASS}
              disabled={submitting}
            />
          </label>
          {mode !== 'forgot' && (
            <label className="block">
              <FieldLabel>Password</FieldLabel>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className={INPUT_CLASS}
                disabled={submitting}
              />
            </label>
          )}

          {error && <div className="text-sm text-status-danger-fg">{error}</div>}
          {info && <div className="text-sm text-muted-foreground">{info}</div>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting
              ? 'Working…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'register'
                  ? 'Create account'
                  : 'Send reset link'}
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          {mode === 'signin' ? (
            <>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => switchMode('forgot')}
              >
                Forgot password?
              </button>
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => switchMode('register')}
              >
                Create account
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => switchMode('signin')}
            >
              Back to sign in
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
