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
import { PageBody, PAGE_BODY_WIDTH } from '../../components/control-plane';
import { AppearanceSettings } from './AppearanceSettings';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../../platform/auth/passwordPolicy';
import { FieldRow, Section } from '../../platform/engine-config/SettingsControls';
import { EYEBROW_CLASS, TEXT_MUTED_XS, TEXT_TITLE_SM } from '../../lib/utils';
import { useViewportBelow } from '../../hooks/useViewportBelow';
import { SHELL_RAIL_MIN_WIDTH } from '../../platform/product-shell/WorkspaceShell';
import { ActiveChoice } from '../../components/ActiveChoice';

// Profile/security editing is locked for the local-mode bootstrap identity
// (no password, no real account); a signed-in account (cloud mode, or any
// non-bootstrap identity) unlocks them. Derived from useAuth() per page.

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: 'Account', items: [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security' },
    { id: 'sessions', label: 'Sessions' },
  ] },
  // No "Workspace defaults › Modules" and no "Notifications".
  //
  // Modules was a read-only restatement of the per-workspace Modules tab with
  // zero controls and a hardcoded three-module list that had already drifted
  // (no Entries), so it answered a question the real catalog answers better and
  // could only ever be more wrong. Notifications was an empty "Not available
  // yet" card. Both cost a nav row and returned nothing; a nav entry that leads
  // to a placeholder teaches the operator that this nav is not worth reading.
  { group: 'Preferences', items: [
    { id: 'appearance', label: 'Appearance' },
  ] },
];
const SECTION_IDS = NAV.flatMap((g) => g.items.map((i) => i.id));

/* ----------------------------- shared bits ----------------------------- */

/** The page's title row, and the only place a form's primary action goes.
 *  Save used to ride the first section's `action` slot, where it hung mid-page
 *  beside a collapsible heading and read as saving that section rather than
 *  the page, while the title row above it sat empty (ACC-1). */
function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className={`mt-0.5 text-sm text-muted-foreground ${PAGE_BODY_WIDTH.prose}`}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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
    <PageBody variant="form" className="space-y-6">
      <PageHead
        title="Profile"
        subtitle="Your name and how you appear across the app."
        action={
          <Button size="sm" disabled={locked}>
            Save changes
          </Button>
        }
      />

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

      {locked ? <Note>Profile editing unlocks once you sign in with an account.</Note> : null}
    </PageBody>
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
    <PageBody variant="form" className="space-y-6">
      <PageHead
        title="Security"
        subtitle="Manage your password and account security."
        action={
          <Button
            size="sm"
            disabled={locked || busy || !current || !next || !confirm}
            onClick={() => void updatePassword()}
          >
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        }
      />

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
    </PageBody>
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
      <PageBody variant="form" className="flex-1 space-y-6">
        <PageHead title="Sessions" subtitle="Devices and browsers signed in to your account." />

        <div className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">{browser}</div>
              <div className={TEXT_MUTED_XS}>Current session · active now</div>
            </div>
            <span className="rounded-sm bg-action-selected-bg px-1.5 py-0.5 text-2xs font-medium text-action-selected-foreground">
              This device
            </span>
          </div>
        </div>

        <Note>
          This install keeps a single local session. Once you sign in to the cloud, your
          other active sessions appear here and can be revoked individually.
        </Note>
      </PageBody>

      {/* Destructive action, separated, at the bottom of the page. */}
      <div className="border-t border-border p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Sign out</div>
            <div className={TEXT_MUTED_XS}>End this session on this device.</div>
          </div>
          <Button variant="destructive" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppearancePage() {
  return (
    <PageBody variant="form" className="space-y-5">
      <PageHead title="Appearance" subtitle="Theme and density for this browser." />
      <AppearanceSettings />
    </PageBody>
  );
}

/* ------------------------------- shell -------------------------------- */

export function GlobalSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const section = SECTION_IDS.includes(requested ?? '') ? (requested as string) : 'profile';
  const compact = useViewportBelow(SHELL_RAIL_MIN_WIDTH);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <ShuttleWorksMark />
        <span className={TEXT_TITLE_SM}>Account</span>
      </header>

      <div className={`flex min-h-0 flex-1 ${compact ? 'flex-col' : ''}`}>
        {compact ? (
          <div className="shrink-0 border-b border-border p-3">
            <label htmlFor="global-settings-section" className={`mb-1 block ${EYEBROW_CLASS} text-muted-foreground`}>
              Account section
            </label>
            <select
              id="global-settings-section"
              data-testid="global-settings-select"
              value={section}
              onChange={(event) => setSearchParams({ section: event.target.value })}
              className="h-9 w-full rounded-sm border border-border-control bg-bg-elev px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {NAV.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : (
          <nav aria-label="Account sections" className="w-56 shrink-0 space-y-4 overflow-y-auto border-r border-border p-3">
            {NAV.map((g) => (
              <div key={g.group} className="space-y-0.5">
                <div className={`px-2 pb-1 ${EYEBROW_CLASS} text-muted-foreground`}>
                  {g.group}
                </div>
                {g.items.map((it) => (
                  <ActiveChoice
                    key={it.id}
                    active={section === it.id}
                    geometry="row"
                    semantics="page"
                    data-testid={`global-settings-${it.id}`}
                    onClick={() => setSearchParams({ section: it.id })}
                    className="block w-full px-2 py-1.5 text-sm"
                  >
                    {it.label}
                  </ActiveChoice>
                ))}
              </div>
            ))}
          </nav>
        )}

        <div className="min-w-0 flex-1 overflow-y-auto">
          {section === 'profile' && <ProfilePage />}
          {section === 'security' && <SecurityPage />}
          {section === 'sessions' && <SessionsPage />}
          {section === 'appearance' && <AppearancePage />}
        </div>
      </div>
    </div>
  );
}
