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
 *
 * Password-setting flows (create account, reset, and Settings → Security)
 * all follow the same contract: a confirm field, the policy stated as a
 * hint BEFORE submission, and failures anchored to the field that caused
 * them. The server remains authoritative — ``validate_password`` also
 * rejects breached passwords, which the client cannot check.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams, type Location } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Button, Card, TextField } from '@scheduler/design-system';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from './passwordPolicy';
import { SwMonogram } from '../../components/ShuttleWorksMark';
import { BRAND } from '@scheduler/brand';

interface FromState {
  from?: Pick<Location, 'pathname' | 'search' | 'hash'>;
}

/**
 * Preserve the complete return destination supplied by AuthGuard.  Keeping
 * the query and hash matters for filtered operator views, deep links, and
 * invite/publication flows; pathname-only redirects silently reset that
 * context after a successful sign-in.
 */
export function returnDestination(state: unknown): string {
  const from = (state as FromState | null | undefined)?.from;
  if (!from?.pathname || !from.pathname.startsWith('/')) return '/';
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

type Mode = 'signin' | 'register' | 'forgot';

interface AuthFailure {
  message: string;
  /** Field to anchor the message to, when the server named one. */
  field?: 'email' | 'password';
}

/** Human message for an auth failure, preferring the structured code. */
function authFailure(err: unknown): AuthFailure {
  const e = err as {
    code?: string;
    message?: string;
    response?: { data?: { detail?: { retryAfterSeconds?: number } } };
  };
  switch (e.code) {
    case 'AUTH_THROTTLED': {
      const secs = e.response?.data?.detail?.retryAfterSeconds;
      return {
        message: secs
          ? `Too many attempts. Try again in ${secs}s.`
          : 'Too many attempts. Try again shortly.',
      };
    }
    case 'AUTH_INVALID_CREDENTIALS':
      return { message: 'Invalid email or password.' };
    case 'AUTH_WEAK_PASSWORD':
      return { message: e.message || 'Choose a stronger password.', field: 'password' };
    case 'AUTH_EMAIL_TAKEN':
      return { message: 'An account already exists for that address.', field: 'email' };
    case 'AUTH_INVALID_EMAIL':
      return { message: 'Enter a valid email address.', field: 'email' };
    default:
      return { message: e.message || 'Something went wrong. Please try again.' };
  }
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const from = returnDestination(location.state);

  /** Form-level error: only what we could not anchor to a field. */
  const formError = failure && !failure.field ? failure.message : null;
  const fieldError = (field: 'email' | 'password') =>
    failure?.field === field ? failure.message : undefined;

  // ---- ?reset=<token>: set-new-password form -------------------------
  // Takes precedence over the session redirect so a signed-in browser
  // can still complete a reset link it was mailed.
  if (resetToken) {
    const handleReset = async (e: FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmNewPassword) {
        setConfirmError('Passwords do not match.');
        return;
      }
      setSubmitting(true);
      setFailure(null);
      setConfirmError(null);
      try {
        await apiClient.resetPassword(resetToken, newPassword);
        // Same route, param dropped — the component stays mounted, so the
        // confirmation below survives the navigation.
        setInfo('Password updated. Sign in with your new password.');
        setNewPassword('');
        setConfirmNewPassword('');
        navigate('/login', { replace: true });
      } catch (err) {
        setFailure(authFailure(err));
      } finally {
        setSubmitting(false);
      }
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Card className="w-full max-w-md p-8 space-y-5">
          <div>
            <h1 className="type-display flex items-center gap-2.5 text-2xl">
              <SwMonogram />
              {BRAND.productName}
              <span className="text-xs font-medium text-muted-foreground">{BRAND.endorsement}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Choose a new password</p>
          </div>
          <form onSubmit={handleReset} className="space-y-3">
            <TextField
              label="New password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              hint={PASSWORD_HINT}
              error={fieldError('password')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
            />
            <TextField
              label="Confirm new password"
              type="password"
              required
              error={confirmError ?? undefined}
              value={confirmNewPassword}
              onChange={(e) => {
                setConfirmNewPassword(e.target.value);
                setConfirmError(null);
              }}
              autoComplete="new-password"
              disabled={submitting}
            />
            {formError && (
              <div role="alert" className="text-sm text-status-danger-fg">
                {formError}
              </div>
            )}
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
    if (mode === 'register' && password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setFailure(null);
    setConfirmError(null);
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
      setFailure(authFailure(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setFailure(null);
    setConfirmError(null);
    setConfirmPassword('');
    setInfo(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <Card className="w-full max-w-md p-8 space-y-5">
        <div>
          <h1 className="type-display flex items-center gap-2.5 text-2xl">
            <SwMonogram />
            {BRAND.productName}
            <span className="text-xs font-medium text-muted-foreground">{BRAND.endorsement}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'signin' && 'Sign in to continue'}
            {mode === 'register' && 'Create your account'}
            {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <TextField
              label="Display name (optional)"
              type="text"
              hint="How you appear to everyone else in a workspace."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              disabled={submitting}
            />
          )}
          <TextField
            label="Email"
            type="email"
            required
            error={fieldError('email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={submitting}
          />
          {mode !== 'forgot' && (
            <TextField
              label="Password"
              type="password"
              required
              minLength={mode === 'register' ? PASSWORD_MIN_LENGTH : undefined}
              hint={mode === 'register' ? PASSWORD_HINT : undefined}
              error={fieldError('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              disabled={submitting}
            />
          )}
          {mode === 'register' && (
            <TextField
              label="Confirm password"
              type="password"
              required
              error={confirmError ?? undefined}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmError(null);
              }}
              autoComplete="new-password"
              disabled={submitting}
            />
          )}

          {formError && (
            <div role="alert" className="text-sm text-status-danger-fg">
              {formError}
            </div>
          )}
          {info && (
            <div role="status" className="text-sm text-muted-foreground">
              {info}
            </div>
          )}

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
