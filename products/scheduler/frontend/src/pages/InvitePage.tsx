/**
 * Invite-link landing page (``/invite/:token``).
 *
 * The public ``GET /invites/{token}`` lookup fires on mount to surface
 * the tournament name + role being granted. If the recipient isn't
 * signed in we redirect to ``/login`` first; on successful login the
 * AuthProvider re-renders this page and we POST ``accept``.
 *
 * Already-a-member is a happy path: the spec calls for idempotent
 * accept, so a redirect to the tournament happens regardless.
 */
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import type { InviteResolveDTO } from '../api/dto';
import { Button, Card } from '@scheduler/design-system';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  const [invite, setInvite] = useState<InviteResolveDTO | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiClient.resolveInvite(token);
        if (cancelled) return;
        setInvite(r);
      } catch (err) {
        if (cancelled) return;
        setResolveError(err instanceof Error ? err.message : 'Invite not found');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = useCallback(async () => {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const r = await apiClient.acceptInvite(token);
      navigate(`/tournaments/${r.tournamentId}/setup`, { replace: true });
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Could not accept invite');
    } finally {
      setAccepting(false);
    }
  }, [token, navigate]);

  // Wait for the AuthProvider's initial getSession() before deciding.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Not signed in → bounce to login, preserving the invite URL so the
  // user lands back here automatically after auth.
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: `/invite/${token}` } }}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <Card className="w-full max-w-md p-8 space-y-5">
        <h1 className="text-2xl font-medium tracking-tight">Join tournament</h1>

        {resolveError && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {resolveError}
          </div>
        )}

        {invite && !invite.valid && (
          <div className="text-sm text-muted-foreground">
            This invite link is no longer valid. Ask the tournament owner
            to send you a new one.
          </div>
        )}

        {invite && invite.valid && (
          <>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">You'll join</div>
              <div className="text-lg font-medium">
                {invite.tournamentName || 'Untitled tournament'}
              </div>
              <div className="text-sm text-muted-foreground">
                as <span className="font-medium">{invite.role}</span>
              </div>
            </div>

            {acceptError && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {acceptError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => navigate('/')}>
                Cancel
              </Button>
              <Button onClick={handleAccept} disabled={accepting}>
                {accepting ? 'Joining…' : 'Accept invitation'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
