/**
 * Tournament data section of bracket Setup.
 *
 * Bundle 5 ships exports-only — three Export buttons (JSON / CSV / ICS)
 * via the existing apiClient.bracketExport*Url builders. No import,
 * no backup, no reset. The same export URLs are also linked from
 * BracketScheduleHeader; both surfaces keep the affordance because
 * operators reach for "data ops" from either Setup or Schedule.
 *
 * Wrapped in SettingsPrimitives.SectionHeader + Row so the visual
 * rhythm matches meet's DataSettings.
 */
import { apiClient } from '../../api/client';
import { useTournamentId } from '../../hooks/useTournamentId';
import { Row, SectionHeader } from '../settings/SettingsControls';

const LINK_CLASSES =
  'inline-flex items-center rounded-sm border border-border bg-card px-3 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40';

export function BracketDataSection() {
  const tid = useTournamentId();
  return (
    <div>
      <SectionHeader>Export</SectionHeader>
      <Row
        label="JSON snapshot"
        control={
          <a className={LINK_CLASSES} href={apiClient.bracketExportJsonUrl(tid)} download>
            Export JSON
          </a>
        }
      />
      <Row
        label="CSV spreadsheet"
        control={
          <a className={LINK_CLASSES} href={apiClient.bracketExportCsvUrl(tid)} download>
            Export CSV
          </a>
        }
      />
      <Row
        label="iCalendar feed"
        control={
          <a className={LINK_CLASSES} href={apiClient.bracketExportIcsUrl(tid)} download>
            Export ICS
          </a>
        }
        last
      />
    </div>
  );
}
