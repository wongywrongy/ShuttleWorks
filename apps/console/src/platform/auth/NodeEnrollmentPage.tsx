import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, TextField } from '@scheduler/design-system';
import { PageBody } from '../../components/control-plane/PageBody';
import { apiClient } from '../../api/client';
import type { UserDTO } from '../../api/dto';
import { useAuth } from '../../context/AuthContext';
import { authWorkspaceScope } from '../../lib/authWorkspaceScope';
import { MfaCeremony } from './MfaCeremony';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from './passwordPolicy';

/** The activation token is entered privately; it never goes into a URL or storage. */
export function NodeEnrollmentPage() {
  const [search] = useSearchParams();
  const workspaceId = authWorkspaceScope('/node-enrollment', search.toString(), null);
  const { pendingUser, refresh } = useAuth();
  const [activated, setActivated] = useState<UserDTO | null>(pendingUser);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const expired = () => {
      if (workspaceId) navigate(`/login?workspaceId=${workspaceId}&node=1`, { replace: true });
    };
    window.addEventListener('sw:session-expired', expired);
    return () => window.removeEventListener('sw:session-expired', expired);
  }, [workspaceId, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || busy) return;
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    setError(null);
    try {
      const user = await apiClient.activateNodeOperator({ workspaceId, email, activationToken: token, newPassword: password });
      setActivated(user);
      setToken('');
      setConfirmPassword('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Activation failed. Check your activation details.');
    } finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-background text-foreground">
    <PageBody variant="form" className="flex flex-col items-center">
      {!workspaceId ? <p role="alert">Open the enrollment address for your workspace.</p> : activated ?
        <MfaCeremony user={activated} initialPassword={password} onComplete={async () => {
          await refresh();
          setPassword('');
          navigate(`/tournaments/${workspaceId}`, { replace: true });
        }} /> : <Card className="w-full max-w-md space-y-4 p-8">
          <h1 className="text-xl font-semibold">Set up your event-node account</h1>
          <p className="text-sm text-muted-foreground">Use the activation details given privately to you by the node administrator. Choose a password for this node, then set up your authenticator.</p>
          <form onSubmit={submit} className="space-y-4">
            <TextField label="Email" type="email" autoComplete="username" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
            <TextField label="Activation token" type="password" autoComplete="off" required maxLength={512} value={token} onChange={event => setToken(event.target.value)} disabled={busy} />
            <TextField label="Node password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
            <p className="text-sm text-muted-foreground">{PASSWORD_HINT}</p>
            <TextField label="Confirm node password" type="password" autoComplete="new-password" required maxLength={1024} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy} />
            {error && <p role="alert" className="text-sm text-status-danger-fg">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Activating…' : 'Continue to authenticator setup'}</Button>
          </form>
        </Card>}
    </PageBody>
  </main>;
}
