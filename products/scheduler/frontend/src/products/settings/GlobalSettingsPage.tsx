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
import { useMemo } from 'react';
import { Button } from '@scheduler/design-system';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { AppearanceSettings } from '../meet/settings/AppearanceSettings';
import { useAuth } from '../../context/AuthContext';

// The Compose stack runs local-only by default (synthetic local-dev session);
// cloud mode (ENVIRONMENT=cloud + Supabase) unlocks account/security/sync.
const LOCAL_DEV = true;

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

function Field({
  label,
  type = 'text',
  defaultValue,
  placeholder,
  disabled,
}: {
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
      />
    </label>
  );
}

/* ------------------------------- pages -------------------------------- */

function ProfilePage() {
  const { user } = useAuth();
  const email = user?.email ?? 'local@dev';
  const initials = email.trim().charAt(0).toUpperCase() || 'L';
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
          <Button variant="outline" size="sm" disabled={LOCAL_DEV}>
            Change photo
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, up to 2&nbsp;MB.</p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Full name" defaultValue="" placeholder="Your name" disabled={LOCAL_DEV} />
        <Field label="Email" type="email" defaultValue={email} disabled={LOCAL_DEV} />
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={LOCAL_DEV}>Save changes</Button>
        {LOCAL_DEV ? (
          <Note>Profile editing unlocks in cloud mode (Supabase Auth).</Note>
        ) : null}
      </div>
    </div>
  );
}

function SecurityPage() {
  return (
    <div className="max-w-xl space-y-6 p-6">
      <PageHead title="Security" subtitle="Manage your password and account security." />

      <div className="space-y-4">
        <Field label="Current password" type="password" placeholder="••••••••" disabled={LOCAL_DEV} />
        <Field label="New password" type="password" placeholder="••••••••" disabled={LOCAL_DEV} />
        <Field label="Confirm new password" type="password" placeholder="••••••••" disabled={LOCAL_DEV} />
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={LOCAL_DEV}>Update password</Button>
        {LOCAL_DEV ? (
          <Note>Full security management is available in cloud mode.</Note>
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
          Session management is handled by your local-dev environment. In cloud mode,
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
    desc: 'Single-day meet cockpit — roster, CP-SAT court assignments, live scoring.',
    defaultState: 'Available',
  },
  {
    id: 'bracket',
    name: 'Bracket',
    desc: 'Single-elimination + round-robin draws — seeding, advancement, import/export.',
    defaultState: 'Available',
  },
  {
    id: 'display',
    name: 'Display',
    desc: 'Read-only public TV display of live matches, draws, and results.',
    defaultState: 'Available',
    integration: {
      name: 'Supabase sync',
      desc: 'Required for the live public display — mirrors state to viewer browsers.',
      envVar: 'ENVIRONMENT=cloud + SUPABASE_URL',
    },
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
              <div className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
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
