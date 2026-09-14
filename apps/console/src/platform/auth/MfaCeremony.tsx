import { useState, type FormEvent } from 'react';
import { Button, Card, TextField } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { UserDTO } from '../../api/dto';

interface Props {
  user: UserDTO;
  initialPassword?: string;
  onComplete: () => Promise<void>;
  onCancel?: () => Promise<void>;
  replace?: boolean;
  cancelLabel?: string;
}

/** Secrets stay in this mounted ceremony and are never persisted in browser storage. */
export function MfaCeremony({ user, initialPassword = '', onComplete, onCancel, replace = false, cancelLabel = 'Sign out' }: Props) {
  const setup = replace || !user.mfaEnrolled;
  const [password, setPassword] = useState(initialPassword);
  const [code, setCode] = useState('');
  const [seed, setSeed] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!setup) {
        await apiClient.verifyMfa(password, code);
        setPassword('');
        setCode('');
        await onComplete();
      } else if (seed === null) {
        const started = await apiClient.beginMfa(password);
        setSeed(started.secret);
        setPassword('');
      } else {
        const confirmed = await apiClient.confirmMfa(code);
        setSeed(null);
        setCode('');
        setRecovery(confirmed.recoveryCodes);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (recovery) {
    return <Card className="w-full max-w-md space-y-4 p-8">
      <h1 className="text-xl font-semibold">Save your recovery codes</h1>
      <p className="text-sm text-muted-foreground">Each code works once, together with your password. Save them somewhere private before continuing. They are shown only now.</p>
      <ul aria-label="Recovery codes" className="space-y-1 font-mono text-sm">
        {recovery.map((value) => <li key={value}>{value}</li>)}
      </ul>
      <Button disabled={busy} onClick={() => {
        setBusy(true);
        void onComplete().catch(() => {
          setError('Could not continue. Your codes are still here; try again.');
          setBusy(false);
        });
      }}>I have saved my codes</Button>
      {error && <p role="alert" className="text-sm text-status-danger-fg">{error}</p>}
    </Card>;
  }

  return <Card className="w-full max-w-md space-y-4 p-8">
    <h1 className="text-xl font-semibold">{replace ? 'Replace your authenticator' : setup ? 'Set up an authenticator' : 'Verify your identity'}</h1>
    <p className="text-sm text-muted-foreground">{user.email}</p>
    {replace && <p className="text-sm text-muted-foreground">Keep your old authenticator until verification succeeds. Confirming the replacement invalidates the old authenticator and recovery codes and signs out your other sessions.</p>}
    <form onSubmit={submit} className="space-y-4">
      {seed === null && <TextField label="Current password" type="password" autoComplete="current-password"
        required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />}
      {seed && <>
        <p className="text-sm">In your authenticator app, add a time-based account for ShuttleWorks using this setup key.</p>
        <code aria-label="Authenticator setup key" className="block break-all rounded bg-muted p-3 text-sm">{seed}</code>
        <p className="text-sm text-muted-foreground">Then enter its current six-digit code.</p>
      </>}
      {(!setup || seed !== null) && <TextField
        label={!setup ? 'Authenticator or recovery code' : 'Authenticator code'}
        autoComplete="one-time-code" required maxLength={64} value={code}
        onChange={(event) => setCode(event.target.value)} disabled={busy} />}
      {error && <p role="alert" className="text-sm text-status-danger-fg">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Verifying…' : setup && !seed ? 'Create setup key' : 'Verify'}
      </Button>
    </form>
    {onCancel && <Button variant="ghost" disabled={busy} onClick={() => void onCancel()}>{cancelLabel}</Button>}
  </Card>;
}
