import { useState, type FormEvent } from 'react';
import { Button, Card, Notice, TextField } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { UserDTO } from '../../api/dto';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import { mfaFailureMessage } from './mfaFailure';

/** `verify` proves an existing factor; `enroll` sets one up; `replace` sets up
 *  a new one while the old one keeps working until confirmation. The caller
 *  chooses: a re-authentication prompt must never silently become enrollment. */
export type MfaCeremonyMode = 'verify' | 'enroll' | 'replace';

interface Props {
  user: UserDTO;
  mode: MfaCeremonyMode;
  initialPassword?: string;
  onComplete: () => Promise<void>;
  onCancel?: () => Promise<void> | void;
  cancelLabel?: string;
}

/** Secrets stay in this mounted ceremony and are never persisted in browser storage. */
export function MfaCeremony({ user, mode, initialPassword = '', onComplete, onCancel, cancelLabel = 'Sign out' }: Props) {
  const setup = mode !== 'verify';
  const [password, setPassword] = useState(initialPassword);
  const [code, setCode] = useState('');
  const [seed, setSeed] = useState<{ secret: string; expiresAt: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startOver = () => {
    // The server's pending enrollment simply expires; nothing to cancel there.
    setSeed(null);
    setCode('');
    setError(null);
  };

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
        setSeed({ secret: started.secret, expiresAt: started.expiresAt });
        setPassword('');
      } else {
        const confirmed = await apiClient.confirmMfa(code);
        setSeed(null);
        setCode('');
        setRecovery(confirmed.recoveryCodes);
      }
    } catch (failure) {
      setError(mfaFailureMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  if (recovery) return <RecoveryCodesPanel codes={recovery} onAcknowledge={onComplete} />;

  const title = mode === 'replace' ? 'Replace your authenticator' : mode === 'enroll' ? 'Set up an authenticator' : 'Verify your identity';
  const expires = seed ? new Date(seed.expiresAt) : null;
  return <Card className="w-full max-w-md space-y-4 p-8">
    <h1 className="text-xl font-semibold">{title}</h1>
    <p className="text-sm text-muted-foreground">{user.email}</p>
    {mode === 'replace' && <p className="text-sm text-muted-foreground">Keep your old authenticator until verification succeeds. Confirming the replacement invalidates the old authenticator and recovery codes and signs out your other sessions.</p>}
    <form onSubmit={submit} className="space-y-4">
      {seed === null && <TextField label="Current password" type="password" autoComplete="current-password"
        required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />}
      {seed && <>
        <p className="text-sm">In your authenticator app, add a time-based account for ShuttleWorks using this setup key.</p>
        <code aria-label="Authenticator setup key" className="block break-all rounded bg-muted p-3 text-sm">{seed.secret}</code>
        <p className="text-sm text-muted-foreground">
          Then enter its current six-digit code.
          {expires && !Number.isNaN(expires.getTime()) && <> This setup key works until {expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}; after that, start over.</>}
        </p>
      </>}
      {(!setup || seed !== null) && <TextField
        label={!setup ? 'Authenticator or recovery code' : 'Authenticator code'}
        autoComplete="one-time-code" required maxLength={64} value={code}
        onChange={(event) => setCode(event.target.value)} disabled={busy} />}
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Verifying…' : setup && !seed ? 'Create setup key' : 'Verify'}
        </Button>
        {seed && <Button type="button" variant="ghost" disabled={busy} onClick={startOver}>Start over</Button>}
      </div>
    </form>
    {onCancel && <Button variant="ghost" disabled={busy} onClick={() => void onCancel()}>{cancelLabel}</Button>}
  </Card>;
}
