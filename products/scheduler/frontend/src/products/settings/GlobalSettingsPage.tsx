/**
 * Global Settings (route `/settings`) — application-wide preferences, reached
 * from the sidebar gear. Distinct from per-workspace Settings: this is where
 * appearance, account, and integrations live. A left rail switches sections,
 * deep-linkable via `?section=`.
 */
import { useSearchParams } from 'react-router-dom';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { Eyebrow } from '../../components/control-plane';
import { AppearanceSettings } from '../meet/settings/AppearanceSettings';
import { useAuth } from '../../context/AuthContext';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'integrations', label: 'Integrations' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

function AccountSection() {
  const { user } = useAuth();
  return (
    <div className="max-w-xl space-y-4 p-6">
      <div>
        <Eyebrow framed>Account</Eyebrow>
        <h2 className="mt-1 text-base font-semibold text-foreground">Signed in</h2>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="text-foreground">{user?.email ?? 'local@dev'}</dd>
        <dt className="text-muted-foreground">Session</dt>
        <dd className="text-foreground">Local-dev</dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        This session is managed by your local-dev environment. Account management
        (sign-in, profile, sign-out) becomes available when the app runs in cloud
        mode against Supabase Auth.
      </p>
    </div>
  );
}

function IntegrationsSection() {
  return (
    <div className="max-w-xl space-y-4 p-6">
      <div>
        <Eyebrow framed>Integrations</Eyebrow>
        <h2 className="mt-1 text-base font-semibold text-foreground">External services</h2>
      </div>
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Supabase sync</div>
            <div className="text-xs text-muted-foreground">
              Mirrors live state to operator browsers and the public display.
            </div>
          </div>
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
            Not configured
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Integrations are configured via the backend environment (set
        <span className="font-mono"> ENVIRONMENT=cloud</span> with Supabase
        credentials). None are connected in this local-dev session.
      </p>
    </div>
  );
}

export function GlobalSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const section: SectionId = SECTIONS.some((s) => s.id === requested)
    ? (requested as SectionId)
    : 'appearance';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <ShuttleWorksMark />
        <span className="text-sm font-semibold text-foreground">Settings</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 space-y-0.5 border-r border-border p-3">
          <div className="px-2 pb-2">
            <Eyebrow>Global</Eyebrow>
          </div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`global-settings-${s.id}`}
              aria-pressed={section === s.id}
              onClick={() => setSearchParams({ section: s.id })}
              className={[
                'block w-full rounded-sm px-2 py-1.5 text-left text-sm',
                section === s.id
                  ? 'bg-accent/10 font-medium text-accent'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {section === 'appearance' && (
            <div className="max-w-2xl space-y-4 p-6">
              <div>
                <Eyebrow framed>Appearance</Eyebrow>
                <h2 className="mt-1 text-base font-semibold text-foreground">Theme &amp; density</h2>
              </div>
              <AppearanceSettings />
            </div>
          )}
          {section === 'account' && <AccountSection />}
          {section === 'integrations' && <IntegrationsSection />}
        </div>
      </div>
    </div>
  );
}
