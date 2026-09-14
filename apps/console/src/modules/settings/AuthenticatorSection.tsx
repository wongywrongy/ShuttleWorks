/**
 * Settings › Security › Authenticator. Offered to every signed-in account with
 * a password, not only where policy forces MFA: an operator on a deployment
 * that does not require an authenticator may still choose one.
 *
 * - Set up: the enrollment ceremony (password, setup key, first code).
 * - Replace: a new authenticator; the old one works until confirmation.
 * - New recovery codes: a current authenticator code proves possession.
 * - Turn off: only where the deployment does not require MFA (the API refuses
 *   otherwise), behind a two-press confirmation.
 *
 * Every entry first asks the server whether this session is fresh; a stale
 * one raises the verification lock and the action continues afterwards.
 */
import { useState, type FormEvent } from 'react';
import { Button, Notice, TextField } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { UserDTO } from '../../api/dto';
import { isFreshProofCancelled } from '../../api/sessionRestore';
import { useAuth } from '../../context/AuthContext';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { Section } from '../../platform/engine-config/SettingsControls';
import { MfaCeremony } from '../../platform/auth/MfaCeremony';
import { RecoveryCodesPanel } from '../../platform/auth/RecoveryCodesPanel';
import { mfaFailureMessage } from '../../platform/auth/mfaFailure';

type View = 'idle' | 'enroll' | 'replace' | 'reissue' | 'disable';
const RECOVERY_CODE_COUNT = 8;

function ProofForm({ submitLabel, codeLabel, confirmLabel, onSubmit, onCancel }: {
  submitLabel: string;
  codeLabel: string;
  /** When set, the first press arms and names this consequence. */
  confirmLabel?: string;
  onSubmit: (password: string, code: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password, code);
    } catch (failure) {
      setError((failure as { code?: string })?.code === 'AUTH_REAUTH_REQUIRED'
        ? 'Verify your identity in the prompt, then submit again with a new code.'
        : mfaFailureMessage(failure));
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  const confirm = useConfirmClick(() => void run());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (confirmLabel) confirm.press();
    else void run();
  };
  return <form onSubmit={submit} className="space-y-3">
    <TextField label="Current password" type="password" autoComplete="current-password" required
      value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
    <TextField label={codeLabel} autoComplete="one-time-code" required maxLength={64}
      value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} />
    {error && <Notice tone="danger" role="alert">{error}</Notice>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant={confirmLabel ? 'destructive' : 'default'} disabled={busy}>
        {busy ? 'Working…' : confirmLabel && confirm.armed ? confirmLabel : submitLabel}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  </form>;
}

export function AuthenticatorSection({ user }: { user: UserDTO }) {
  const { refresh } = useAuth();
  const [view, setView] = useState<View>('idle');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = (next: View) => {
    setError(null);
    setNotice(null);
    void apiClient.requireFreshAuthentication().then(() => setView(next)).catch((failure) => {
      if (!isFreshProofCancelled(failure)) setError(mfaFailureMessage(failure));
    });
  };
  const close = () => setView('idle');

  if (codes) {
    return <Section title="Authenticator and recovery codes" defaultOpen>
      <RecoveryCodesPanel title="Your new recovery codes" codes={codes} onAcknowledge={async () => {
        await refresh();
        setCodes(null);
        setView('idle');
      }} />
    </Section>;
  }

  let body: React.ReactNode;
  if (view === 'enroll' || view === 'replace') {
    body = <MfaCeremony user={user} mode={view} cancelLabel="Cancel" onCancel={close}
      onComplete={async () => { await refresh(); close(); }} />;
  } else if (view === 'reissue') {
    body = <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Every current recovery code stops working. Enter a code from your authenticator app; a recovery code cannot issue new ones.</p>
      <ProofForm submitLabel="Issue new recovery codes" codeLabel="Authenticator code" onCancel={close}
        onSubmit={async (password, code) => {
          const issued = await apiClient.reissueRecoveryCodes(password, code);
          setCodes(issued.recoveryCodes);
        }} />
    </div>;
  } else if (view === 'disable') {
    body = <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Sign-in will ask only for your password. Your recovery codes stop working and your other sessions are signed out.</p>
      <ProofForm submitLabel="Turn off authenticator" confirmLabel="Confirm: turn off authenticator"
        codeLabel="Authenticator or recovery code" onCancel={close}
        onSubmit={async (password, code) => {
          await apiClient.disableMfa(password, code);
          await refresh();
          close();
          setNotice('Authenticator turned off.');
        }} />
    </div>;
  } else if (!user.mfaEnrolled && !user.mfaAvailable) {
    body = <Notice tone="info">Authenticator sign-in is not configured on this server. An administrator enables it by providing an encryption key ring.</Notice>;
  } else if (!user.mfaEnrolled) {
    body = <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Add a time-based authenticator app. Sign-in will then ask for a six-digit code after your password.</p>
      <Button onClick={() => open('enroll')}>Set up an authenticator</Button>
    </div>;
  } else {
    const remaining = user.mfaRecoveryCodesRemaining;
    body = <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {user.mfaEnforced ? 'This deployment requires an authenticator for operator sign-in.' : 'You chose to protect sign-in with an authenticator.'}
        {typeof remaining === 'number' && <> {remaining} of {RECOVERY_CODE_COUNT} recovery codes remain unused.</>}
      </p>
      {typeof remaining === 'number' && remaining <= 2 && <Notice tone="warning">You are running low on recovery codes. Issue a new set while you still have your authenticator.</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => open('reissue')}>Issue new recovery codes</Button>
        <Button variant="outline" onClick={() => open('replace')}>Replace authenticator</Button>
        {!user.mfaEnforced && <Button variant="ghost" onClick={() => open('disable')}>Turn off authenticator</Button>}
      </div>
    </div>;
  }

  return <Section title="Authenticator and recovery codes" defaultOpen>
    {body}
    {error && <Notice tone="danger" role="alert">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
  </Section>;
}
