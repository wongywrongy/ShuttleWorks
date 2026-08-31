/**
 * Resolves the shell-owned workspace segments (Overview, Display configuration,
 * and the WORKSPACE admin sections) to their surfaces. The admin sections reuse
 * the existing settings tab components — re-homed from the former standalone
 * `/tournaments/:id/settings` page. The workspace summary is fetched once here
 * and shared across the readiness Overview + the admin tabs that need it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@scheduler/design-system';
import type { AppTab } from '../../store/uiStore';
import type { WorkspaceModule } from '../../platform/product-shell/types';
import type { TournamentSummaryDTO } from '../../api/dto';
import { apiClient } from '../../api/client';
import { ActionsBar, PageBody } from '../../components/control-plane';
import { useTournamentId } from '../../hooks/useTournamentId';
import { WorkspaceOverview } from './WorkspaceOverview';
import { DisplayConfig } from './DisplayConfig';
import { VenueScheduleTab } from './VenueScheduleTab';
import { PeopleAccessTab } from '../settings/PeopleAccessTab';
import { SharingTab } from '../settings/SharingTab';
import { ModulesSettingsTab } from '../settings/ModulesSettingsTab';
import { SyncBackupsTab } from '../settings/SyncBackupsTab';
import { ActivityTab } from '../settings/ActivityTab';
import { GeneralSettingsTab } from '../settings/GeneralSettingsTab';
import { DangerZoneTab } from '../settings/DangerZoneTab';
import { TEXT_MUTED_XS, TEXT_TITLE_SM } from '../../lib/utils'

export function WorkspaceShellSurface({
  segment,
  modules,
}: {
  segment: AppTab;
  modules: WorkspaceModule[];
}) {
  const tid = useTournamentId();
  const location = useLocation();
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

  // Workflow-first Publish routes retain the existing renderer's AppTab for
  // compatibility. Inspect the URL here so `/publish/site`, `/publish/links`,
  // and `/publish/displays` still mount one consolidated Publish surface.
  if (location.pathname.includes('/publish/')) {
    return <PublishProduct tid={tid} modules={modules} />;
  }

  // Overview is the one shell segment that is NOT a form: it is a dashboard of
  // panels and keeps its own wider column. Every other segment here is a
  // settings form, so the container is applied ONCE at the host (LAY-1) rather
  // than hand-rolled eight times — which is how the anchors drifted apart in
  // the first place. The tabs below own their vertical rhythm and nothing else.
  if (segment === 'overview') return <WorkspaceOverview summary={summary} />;

  const surface = (() => {
    switch (segment) {
      case 'display-config':
        return <DisplayConfig tid={tid} modules={modules} />;
      case 'ws-venue':
        return <VenueScheduleTab />;
      case 'ws-members':
        return <PeopleAccessTab tid={tid} summary={summary} />;
      case 'ws-sharing':
        return <SharingTab tid={tid} />;
      case 'ws-modules':
        return <ModulesSettingsTab tid={tid} />;
      case 'ws-sync':
        return location.pathname.endsWith('/administration/activity') ? (
          <ActivityTab tid={tid} />
        ) : (
          <SyncBackupsTab />
        );
      case 'ws-settings':
        return (
          // Two panes, one page. The divider used to carry an `mx-6` that
          // paid for the tabs' own `p-6`; with the gutter owned above it is
          // the column's full width, and `space-y-6` supplies the breathing
          // room the two `p-6`s used to.
          <div className="space-y-6">
            <GeneralSettingsTab tid={tid} summary={summary} onSaved={load} />
            <div className="border-t border-border" />
            <DangerZoneTab tid={tid} summary={summary} onChanged={load} />
          </div>
        );
      default:
        return null;
    }
  })();

  return surface ? <PageBody variant="form">{surface}</PageBody> : null;
}

type PublishPane = 'site' | 'draws-results' | 'displays' | 'links';

const PUBLISH_PANES: readonly { id: PublishPane; label: string; description: string }[] = [
  { id: 'site', label: 'Public site', description: 'Entrants, draws, and results shown on the public tournament page.' },
  { id: 'draws-results', label: 'Draws and results', description: 'Review competition output before making it public.' },
  { id: 'displays', label: 'Venue displays', description: 'Configure the live board used around the venue.' },
  { id: 'links', label: 'Links and embeds', description: 'Share view-only links and embed destinations safely.' },
];

export function paneFromPath(pathname: string): PublishPane {
  const value = pathname.split('/publish/')[1]?.split('/')[0];
  return PUBLISH_PANES.some((pane) => pane.id === value) ? (value as PublishPane) : 'site';
}

/**
 * Publish is workflow composition, not a fifth enableable module. Keeping its
 * facade in the existing shell compositor makes that ownership structural:
 * Site delegates to SharingTab, Displays to DisplayConfig, and Competition
 * keeps draw/result data. No feature module reaches into another module.
 */
export function PublishProduct({ tid, modules = [] }: { tid: string; modules?: WorkspaceModule[] }) {
  const location = useLocation();
  const pane = paneFromPath(location.pathname);
  const active = PUBLISH_PANES.find((candidate) => candidate.id === pane)!;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="publish-product">
      <ActionsBar title="Publish" status={active.description}>
        <span className={TEXT_MUTED_XS}>Changes take effect for new viewers</span>
      </ActionsBar>
      <div className="min-h-0 flex-1 overflow-auto">
        <PageBody variant="data" className="space-y-6">
          <PublishPaneContent pane={pane} tid={tid} modules={modules} />
        </PageBody>
      </div>
    </div>
  );
}

function PublishPaneContent({ pane, tid, modules }: { pane: PublishPane; tid: string; modules: WorkspaceModule[] }) {
  if (pane === 'site') return <SharingTab tid={tid} scope="site" />;
  if (pane === 'links') return <SharingTab tid={tid} scope="links" />;
  if (pane === 'displays') {
    return <DisplayConfig tid={tid} modules={modules} />;
  }
  const bracketEnabled = modules.some((module) => module.id === 'bracket' && module.status === 'enabled');
  return (
    <div className="space-y-4" data-testid="publish-draws-results">
      <div className="rounded border border-border bg-card px-4 py-3">
        <h2 className={TEXT_TITLE_SM}>Draws and results</h2>
        <p className="mt-1 text-xs text-muted-foreground">The competition surface owns draw generation and result correction. Use its existing validation and match context before publishing.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {bracketEnabled ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/tournaments/${encodeURIComponent(tid)}/competition/draws`}>Review draw readiness</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link to={`/tournaments/${encodeURIComponent(tid)}/competition/results`}>Review results</Link>
          </Button>
        </div>
      </div>
      <div className="rounded border border-border bg-card px-4 py-3">
        <h2 className={TEXT_TITLE_SM}>Publication</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Publication toggles live on Site, the single owner for entrant, draw, and result visibility.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to={`/tournaments/${encodeURIComponent(tid)}/publish/site`}>
            Publication toggles live on Site →
          </Link>
        </Button>
      </div>
    </div>
  );
}
