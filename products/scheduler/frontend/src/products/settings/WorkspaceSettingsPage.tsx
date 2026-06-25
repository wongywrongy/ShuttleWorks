/**
 * Workspace Settings center (route `/tournaments/:id/settings`).
 *
 * A dedicated, professional settings surface: header + back-to-workspace, a
 * left tab rail, and a content pane. Tabs: Overview (default), General, Modules,
 * People & Access, Sharing, Sync & Backups, Danger Zone — all functional. The
 * initial tab can be deep-linked via ?tab=. Additive — does not touch Meet Setup.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { ThemeToggle } from '../../components/ThemeToggle';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';
import { SETTINGS_TABS, type SettingsTabId } from './settingsTabs';
import { OverviewTab } from './OverviewTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { ModulesSettingsTab } from './ModulesSettingsTab';
import { DangerZoneTab } from './DangerZoneTab';
import { PeopleAccessTab } from './PeopleAccessTab';
import { SharingTab } from './SharingTab';
import { SyncBackupsTab } from './SyncBackupsTab';

export function WorkspaceSettingsPage() {
  const { id: tid } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Deep-link the initial tab via ?tab= (e.g. the Hub inspector's "Manage sharing"
  // → ?tab=sharing). Unknown values fall back to General. Not a route-path change.
  const requestedTab = searchParams.get('tab');
  const initialTab: SettingsTabId = SETTINGS_TABS.some((t) => t.id === requestedTab)
    ? (requestedTab as SettingsTabId)
    : 'overview';
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const [summary, setSummary] = useState<TournamentSummaryDTO | null>(null);

  const load = useCallback(() => {
    if (!tid) return;
    apiClient
      .getTournament(tid)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [tid]);

  useEffect(() => load(), [load]);

  if (!tid) return null;

  const backSegment = summary?.kind === 'bracket' ? 'bracket-setup' : 'setup';

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <ShuttleWorksMark />
          <button
            type="button"
            onClick={() => navigate(`/tournaments/${tid}/${backSegment}`)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to workspace
          </button>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 space-y-0.5 border-r border-border p-3">
          <div className="px-2 pb-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {summary?.name || 'Workspace'} · Settings
          </div>
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`settings-tab-${t.id}`}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={[
                'block w-full rounded-sm px-2 py-1.5 text-left text-sm',
                tab === t.id
                  ? 'bg-accent/10 font-medium text-accent'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                t.id === 'danger' ? 'mt-2 border-t border-border pt-3' : '',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {tab === 'overview' && <OverviewTab summary={summary} />}
          {tab === 'general' && (
            <GeneralSettingsTab tid={tid} summary={summary} onSaved={load} />
          )}
          {tab === 'modules' && <ModulesSettingsTab tid={tid} />}
          {tab === 'danger' && (
            <DangerZoneTab tid={tid} summary={summary} onChanged={load} />
          )}
          {tab === 'people' && <PeopleAccessTab tid={tid} summary={summary} />}
          {tab === 'sharing' && <SharingTab tid={tid} />}
          {tab === 'sync' && <SyncBackupsTab />}
        </div>
      </div>
    </div>
  );
}
