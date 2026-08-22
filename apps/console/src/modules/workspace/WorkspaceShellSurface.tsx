/**
 * Resolves the shell-owned workspace segments (Overview, Display configuration,
 * and the WORKSPACE admin sections) to their surfaces. The admin sections reuse
 * the existing settings tab components — re-homed from the former standalone
 * `/tournaments/:id/settings` page. The workspace summary is fetched once here
 * and shared across the readiness Overview + the admin tabs that need it.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AppTab } from '../../store/uiStore';
import type { WorkspaceModule } from '../../platform/product-shell/types';
import type { TournamentSummaryDTO } from '../../api/dto';
import { apiClient } from '../../api/client';
import { PageBody } from '../../components/control-plane';
import { useTournamentId } from '../../hooks/useTournamentId';
import { WorkspaceOverview } from './WorkspaceOverview';
import { DisplayConfig } from './DisplayConfig';
import { VenueScheduleTab } from './VenueScheduleTab';
import { PeopleAccessTab } from '../settings/PeopleAccessTab';
import { SharingTab } from '../settings/SharingTab';
import { ModulesSettingsTab } from '../settings/ModulesSettingsTab';
import { SyncBackupsTab } from '../settings/SyncBackupsTab';
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
        return <SyncBackupsTab />;
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
