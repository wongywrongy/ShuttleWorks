/**
 * Invite-link landing page (``/invite/:token``).
 *
 * The public ``GET /invites/{token}`` lookup fires on mount to surface
 * the tournament name + role being granted. If the recipient isn't
 * signed in we redirect to ``/login`` first; on successful login the
 * AuthProvider re-renders this page and we POST ``accept``.
 *
 * Resolution is now all-or-nothing: the endpoint answers one uniform
 * 404 for unknown, revoked, and expired tokens (SP-CLOUD-3), so a
 * resolved invite is by definition acceptable and there is no
 * "invalid invite" render branch — only the error state.
 *
 * Already-a-member is a happy path: the spec calls for idempotent
 * accept, so a redirect to the tournament happens regardless.
 */
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import type { InviteResolveDTO } from '../../api/dto';
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
      } catch {
        if (cancelled) return;
        // The backend answers one uniform 404 for unknown, revoked, and
        // expired tokens (SP-CLOUD-3), so there is nothing to branch on
        // and nothing more specific we could honestly say. Deliberately
        // ignore the error's own message rather than surface a wording
        // difference the API worked to remove.
        setResolveError(
          'This invite link is not valid. Ask the tournament owner to send you a new one.',
        );
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
          <div className="text-sm text-status-danger-fg">
            {resolveError}
          </div>
        )}

        {invite && (
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
              <div className="text-sm text-status-danger-fg">
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
