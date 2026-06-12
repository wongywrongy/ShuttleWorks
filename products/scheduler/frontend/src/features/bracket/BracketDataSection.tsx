/**
 * Tournament data section of bracket Setup.
 *
 * Exports (JSON / CSV / ICS) via the existing apiClient.bracketExport*Url
 * builders, plus the destructive "Reset bracket" action. Reset used to
 * ride along in the per-view header on every bracket tab; a destructive
 * control belongs behind Setup → Tournament data, matching where the
 * meet keeps its data-ops (backup / import / reset live day).
 *
 * Wrapped in SettingsPrimitives.SectionHeader + Row so the visual
 * rhythm matches meet's DataSettings.
 */
import { apiClient } from '../../api/client';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { Row, SectionHeader } from '../settings/SettingsControls';

const LINK_CLASSES =
  'inline-flex items-center rounded-sm border border-border bg-card px-3 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40';

export function BracketDataSection() {
  const tid = useTournamentId();
  const api = useBracketApi();
  const { setData } = useBracket();

  const handleReset = async () => {
    if (!window.confirm('Reset the bracket? All draws, schedules and results are discarded.')) {
      return;
    }
    // Only clear the local copy after the server-side DELETE succeeds.
    // The polling hook re-fetches every 2.5s; clearing on failure
    // would let the next poll snap the bracket back into ``data``.
    // The shared axios interceptor already surfaces a toast on
    // failure, so the ``catch`` is a no-op here.
    try {
      await api.remove();
      setData(null);
    } catch {
      // Interceptor already toasted; nothing more to do.
    }
  };

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
      <SectionHeader>Danger zone</SectionHeader>
      <Row
        label="Reset bracket"
        control={
          <button
            type="button"
            onClick={() => void handleReset()}
            className="inline-flex items-center rounded-sm border border-destructive/40 bg-card px-3 py-1 text-2xs font-medium text-destructive hover:bg-destructive/10"
          >
            Reset bracket
          </button>
        }
        last
      />
    </div>
  );
}
