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

  switch (segment) {
    case 'overview':
      return <WorkspaceOverview summary={summary} />;
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
        <div>
          <GeneralSettingsTab tid={tid} summary={summary} onSaved={load} />
          <div className="mx-6 border-t border-border" />
          <DangerZoneTab tid={tid} summary={summary} onChanged={load} />
        </div>
      );
    default:
      return null;
  }
}
