/**
 * Resolves the shell-owned workspace segments (Overview, Display configuration,
 * and the WORKSPACE admin sections) to their surfaces. The admin sections reuse
 * the existing settings tab components — re-homed from the former standalone
 * workspace administration pages. The workspace summary is fetched once here
 * and shared across the readiness Overview + the admin tabs that need it.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AppTab } from '../../store/uiStore';
import type { WorkspaceModule } from '../../platform/product-shell/types';
import { SHELL_SEGMENT_TITLE } from '../../platform/product-shell/workspaceNav';
import type { TournamentSummaryDTO } from '../../api/dto';
import { apiClient } from '../../api/client';
import { ActionsBar, PageBody } from '../../components/control-plane';
import { ActiveChoice } from '../../components/ActiveChoice';
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

  // Display owns the venue board: its on/off state, courts shown, Show next,
  // appearance and preview (DisplayConfig) plus the board link's copy /
  // replace controls (SharingTab, scope="links"). Publish is gone as a
  // category; its old URLs redirect here.
  if (location.pathname.includes('/display/board')) {
    return <DisplayBoardSettings tid={tid} modules={modules} />;
  }

  // Overview is the one shell segment that is NOT a form: it is a dashboard of
  // panels, so it takes the `canvas` container rather than `form`. Every other
  // segment here is a settings form, so the container is applied ONCE at the
  // host (LAY-1) rather than hand-rolled eight times — which is how the
  // anchors drifted apart in the first place. The tabs below own their
  // vertical rhythm and nothing else.
  const body =
    segment === 'overview' ? <WorkspaceOverview summary={summary} /> : null;

  const surface = (() => {
    switch (segment) {
      case 'ws-venue':
        return <VenueScheduleTab />;
      case 'ws-members':
        return <PeopleAccessTab tid={tid} summary={summary} />;
      case 'ws-sharing':
        return <SharingTab tid={tid} />;
      case 'ws-modules':
        return <ModulesSettingsTab tid={tid} />;
      case 'ws-sync':
      case 'ws-settings':
        return (
          <WorkspaceAdminPage
            tid={tid}
            summary={summary}
            onChanged={load}
            path={location.pathname}
          />
        );
      default:
        return null;
    }
  })();

  if (!body && !surface) return null;

  // One shell-surface root, identical to every module surface: a pinned
  // `ActionsBar` over a single scrolling region that owns nothing but
  // scrolling. Administration used to render bare — no title bar — so the
  // page title baseline vanished the moment the director left a module.
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ActionsBar title={SHELL_SEGMENT_TITLE[segment] ?? 'Workspace'} />
      <div className="min-h-0 flex-1 overflow-auto">
        {body ?? <PageBody variant="form">{surface}</PageBody>}
      </div>
    </div>
  );
}

/**
 * Display · Board — venue-board configuration in one place.
 *
 * `DisplayConfig` supplies the board's own settings, appearance and the
 * fullscreen preview action; `SharingTab` (scope="links") owns the
 * capability URL and its copy / replace controls. One "Venue board" name,
 * two components, no second state owner.
 */
export function DisplayBoardSettings({
  tid,
  modules = [],
}: {
  tid: string;
  modules?: WorkspaceModule[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="display-board-settings">
      <ActionsBar title="Venue board" titleAs="h2" status="Configure and share the board shown in the venue." />
      <div className="min-h-0 flex-1 overflow-auto">
        <PageBody variant="form" className="space-y-6">
          {/* The link controls are composed INTO the board settings, under
              the on/off switch — "is the board on, what is its link" is one
              question in two parts, and they used to sit a screen apart. */}
          <DisplayConfig
            tid={tid}
            modules={modules}
            linkSlot={<SharingTab tid={tid} scope="links" />}
          />
        </PageBody>
      </div>
    </div>
  );
}

/**
 * Administration · **Workspace** — everything that is about this workspace as
 * an object rather than about the event it runs: its settings and lifecycle,
 * its backups, and its activity log.
 *
 * Administration used to list five destinations (Team, Modules, Backups,
 * Activity, Workspace settings), three of which answered questions about the
 * same thing. They are one destination with three tabs now; the URLs are
 * unchanged, so an old bookmark still opens the exact tab it named.
 */
const WORKSPACE_ADMIN_TABS = [
  { path: 'lifecycle', label: 'Settings' },
  { path: 'backups', label: 'Backups' },
  { path: 'activity', label: 'Activity log' },
] as const;

export function WorkspaceAdminPage({
  tid,
  summary,
  onChanged,
  path,
}: {
  tid: string;
  summary: TournamentSummaryDTO | null;
  onChanged: () => void;
  path: string;
}) {
  const current = path.endsWith('/administration/backups')
    ? 'backups'
    : path.endsWith('/administration/activity')
      ? 'activity'
      : 'lifecycle';

  return (
    <div className="space-y-6" data-testid="workspace-admin">
      {/* `ActiveChoice`, not a hand-rolled underline. It was the only
          selection treatment in the console that did not go through the
          single visual owner, so the administration tabs carried a lighter
          "selected" weight than the identical act of selection anywhere
          else — the rail, the segmented controls, the filter chips. */}
      <nav aria-label="Workspace administration" className="flex gap-1">
        {WORKSPACE_ADMIN_TABS.map((tab) => (
          <ActiveChoice
            key={tab.path}
            active={tab.path === current}
            geometry="segment"
            semantics="page"
            to={`/tournaments/${encodeURIComponent(tid)}/administration/${tab.path}`}
            className="px-3 py-1.5 text-sm"
          >
            {tab.label}
          </ActiveChoice>
        ))}
      </nav>

      {current === 'backups' ? (
        // Contract §7: backup timestamps render in the tournament timezone,
        // not the browser's (V3-OC27.2).
        <SyncBackupsTab timeZone={summary?.timeZone} />
      ) : current === 'activity' ? (
        <ActivityTab tid={tid} timeZone={summary?.timeZone} />
      ) : (
        <div className="space-y-6">
          <GeneralSettingsTab tid={tid} summary={summary} onSaved={onChanged} />
          <div className="border-t border-border" />
          <DangerZoneTab tid={tid} summary={summary} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}
