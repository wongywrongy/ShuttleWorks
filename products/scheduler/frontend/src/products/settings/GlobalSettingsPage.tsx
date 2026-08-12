/**
 * Global Settings (route `/settings`) — application-wide preferences, reached
 * from the sidebar gear. Distinct from per-workspace Settings.
 *
 * Modeled after enterprise settings (Vercel / Linear / Retool): a grouped left
 * nav with non-interactive section labels over the actual item pages. Page
 * titles are plain headings (no `[ … ]` decoration — that reads too
 * developer-facing for a settings surface). Forms are real skeletons (labels +
 * inputs + a save action) so cloud mode can simply unlock them; local-dev
 * limitations are footnotes (muted), never accent-colored warnings.
 */
import { useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { AppearanceSettings } from './AppearanceSettings';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../../platform/auth/passwordPolicy';
import { FieldRow, Section } from '../../platform/settings/SettingsControls';
import { EYEBROW_CLASS } from '../../lib/utils';

// Profile/security editing is locked for the local-mode bootstrap identity
// (no password, no real account); a signed-in account (cloud mode, or any
// non-bootstrap identity) unlocks them. Derived from useAuth() per page.

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: 'Account', items: [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security' },
    { id: 'sessions', label: 'Sessions' },
  ] },
  { group: 'Workspace defaults', items: [
    { id: 'modules', label: 'Modules' },
  ] },
  { group: 'Preferences', items: [
    { id: 'appearance', label: 'Appearance' },
    { id: 'notifications', label: 'Notifications' },
  ] },
];
const SECTION_IDS = NAV.flatMap((g) => g.items.map((i) => i.id));

/* ----------------------------- shared bits ----------------------------- */

function PageHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

/** A de-emphasized footnote (local-dev caveats live here — muted, not accent). */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

/* Form fields come from the design system's `TextField` — the local
 * hand-rolled `Field` this page used to carry was one of the duplicated
 * input implementations the design review flagged. */

/* ------------------------------- pages -------------------------------- */

function ProfilePage() {
  const { user, isBootstrap } = useAuth();
  const locked = isBootstrap;
  const email = user?.email ?? 'local@dev';
  const displayName = user?.displayName ?? '';
  const initials = (displayName || email).trim().charAt(0).toUpperCase() || 'L';
  return (
    <div className="max-w-xl space-y-6 p-6">
      <PageHead title="Profile" subtitle="Your name and how you appear across the app." />

      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted text-lg font-semibold text-muted-foreground"
        >
          {initials}
        </span>
        <div>
          <Button variant="outline" size="sm" disabled={locked}>
            Change photo
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, up to 2&nbsp;MB.</p>
        </div>
      </div>

      <Section title="Your details" defaultOpen>
        <FieldRow
          label="Full name"
          defaultValue={displayName}
          placeholder="Your name"
          disabled={locked}
        />
        <FieldRow label="Email" type="email" defaultValue={email} disabled={locked} last />
      </Section>

      <div className="flex items-center gap-3">
        <Button disabled={locked}>Save changes</Button>
        {locked ? (
          <Note>Profile editing unlocks once you sign in with an account.</Note>
        ) : null}
      </div>
    </div>
  );
}

function SecurityPage() {
  const { isBootstrap } = useAuth();
  const locked = isBootstrap;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  async function updatePassword() {
    // Anchored to the confirm field rather than the form footer — the
    // failure belongs to the field that caused it.
    if (next !== confirm) {
      setMismatch('Passwords do not match.');
      return;
    }
    setBusy(true);
    setMismatch(null);
    setFeedback(null);
    try {
      await apiClient.changePassword({ currentPassword: current, newPassword: next });
      setFeedback({ kind: 'success', message: 'Password updated.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not update the password.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6 p-6">
      <PageHead title="Security" subtitle="Manage your password and account security." />

      <Section title="Change password" defaultOpen>
        <FieldRow
          label="Current password"
          type="password"
          placeholder="••••••••"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          disabled={locked}
        />
        <FieldRow
          label="New password"
          type="password"
          placeholder="••••••••"
          minLength={PASSWORD_MIN_LENGTH}
          hint={PASSWORD_HINT}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          disabled={locked}
        />
        <FieldRow
          label="Confirm new password"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setMismatch(null);
          }}
          error={mismatch ?? undefined}
          autoComplete="new-password"
          disabled={locked}
          last
        />
      </Section>

      <div className="flex items-center gap-3">
        <Button
          disabled={locked || busy || !current || !next || !confirm}
          onClick={() => void updatePassword()}
        >
          {busy ? 'Updating…' : 'Update password'}
        </Button>
        {locked ? (
          <Note>Password management is available once you sign in with an account.</Note>
        ) : feedback ? (
          <p
            role="status"
            className={[
              'text-xs leading-relaxed',
              feedback.kind === 'success' ? 'text-accent' : 'text-destructive',
            ].join(' ')}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SessionsPage() {
  const { signOut } = useAuth();
  const browser = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Edg\//.test(ua)) return 'Microsoft Edge';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'This browser';
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="max-w-xl flex-1 space-y-6 p-6">
        <PageHead title="Sessions" subtitle="Devices and browsers signed in to your account." />

        <div className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">{browser}</div>
              <div className="text-xs text-muted-foreground">Current session · active now</div>
            </div>
            <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-2xs font-medium text-accent">
              This device
            </span>
          </div>
        </div>

        <Note>
          This install keeps a single local session. Once you sign in to the cloud, your
          other active sessions appear here and can be revoked individually.
        </Note>
      </div>

      {/* Destructive action, separated, at the bottom of the page. */}
      <div className="border-t border-border p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Sign out</div>
            <div className="text-xs text-muted-foreground">End this session on this device.</div>
          </div>
          <Button variant="destructive" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

const MODULE_DEFAULTS: {
  id: string;
  name: string;
  desc: string;
  defaultState: string;
  integration?: { name: string; desc: string; envVar: string };
}[] = [
  {
    id: 'meet',
    name: 'Meet',
    desc: 'Single-day meet cockpit: roster, CP-SAT court assignments, live scoring.',
    defaultState: 'Available',
  },
  {
    id: 'bracket',
    name: 'Bracket',
    desc: 'Single-elimination + round-robin draws: seeding, advancement, import/export.',
    defaultState: 'Available',
  },
  {
    id: 'display',
    name: 'Display',
    desc: 'Read-only public TV display of live matches, draws, and results.',
    defaultState: 'Available',
  },
];

function ModulesPage() {
  return (
    <div className="max-w-2xl space-y-6 p-6">
      <PageHead
        title="Modules"
        subtitle="The product systems available inside a workspace, and the integrations they rely on."
      />

      <div className="space-y-3">
        {MODULE_DEFAULTS.map((m) => (
          <div key={m.id} className="rounded-md border border-border">
            <div className="flex items-start justify-between gap-4 p-4">
              <div>
                <div className="text-sm font-medium text-foreground">{m.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{m.desc}</div>
              </div>
              <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                {m.defaultState}
              </span>
            </div>
            {m.integration ? (
              <div className="border-t border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-foreground">{m.integration.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{m.integration.desc}</div>
                  </div>
                  <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                    Not configured
                  </span>
                </div>
                <Note>
                  Configured via backend environment:{' '}
                  <span className="font-mono">{m.integration.envVar}</span>.
                </Note>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearancePage() {
  return (
    <div className="max-w-2xl space-y-5 p-6">
      <PageHead title="Appearance" subtitle="Theme and density for this browser." />
      <AppearanceSettings />
    </div>
  );
}

function NotificationsPage() {
  return (
    <div className="max-w-xl space-y-4 p-6">
      <PageHead title="Notifications" subtitle="How and when ShuttleWorks notifies you." />
      <div className="rounded-md border border-dashed border-border p-6 text-center">
        <div className="text-sm font-medium text-foreground">Not available yet</div>
        <Note>Notification preferences will land in a future update.</Note>
      </div>
    </div>
  );
}

/* ------------------------------- shell -------------------------------- */

export function GlobalSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const section = SECTION_IDS.includes(requested ?? '') ? (requested as string) : 'profile';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <ShuttleWorksMark />
        <span className="text-sm font-semibold text-foreground">Settings</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 space-y-4 overflow-y-auto border-r border-border p-3">
          {NAV.map((g) => (
            <div key={g.group} className="space-y-0.5">
              <div className={`px-2 pb-1 ${EYEBROW_CLASS} text-muted-foreground`}>
                {g.group}
              </div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  data-testid={`global-settings-${it.id}`}
                  aria-pressed={section === it.id}
                  onClick={() => setSearchParams({ section: it.id })}
                  className={[
                    'block w-full rounded-sm px-2 py-1.5 text-left text-sm',
                    section === it.id
                      ? 'bg-accent/10 font-medium text-accent'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  ].join(' ')}
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {section === 'profile' && <ProfilePage />}
          {section === 'security' && <SecurityPage />}
          {section === 'sessions' && <SessionsPage />}
          {section === 'modules' && <ModulesPage />}
          {section === 'appearance' && <AppearancePage />}
          {section === 'notifications' && <NotificationsPage />}
        </div>
      </div>
    </div>
  );
}
