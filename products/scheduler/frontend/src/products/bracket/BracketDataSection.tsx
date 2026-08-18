/**
 * Tournament data section of bracket Setup.
 *
 * Exports (JSON / CSV / ICS) via the existing apiClient.bracketExport*Url
 * builders, plus the destructive "Reset bracket" action. Reset used to
 * ride along in the per-view header on every bracket tab; a destructive
 * control belongs behind Setup → Tournament data, matching where the
 * meet keeps its data-ops (backup / import / reset live day).
 *
 * Wrapped in SettingsPrimitives.Section + Row so the visual
 * rhythm matches meet's DataSettings.
 */
import { useCallback, useState } from 'react';
import { Button, Modal } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { useAction } from '../../hooks/useAction';
import { Row, Section } from '../../platform/settings/SettingsControls';

const LINK_CLASSES =
  'inline-flex items-center rounded-sm border border-border bg-card px-3 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40';

export function BracketDataSection() {
  const tid = useTournamentId();
  const api = useBracketApi();
  const { setData } = useBracket();
  // Confirmed in a Modal, not `window.confirm` (banned by the canon; it also
  // blocks the event loop — audit E1). This one destroys data outright, so it
  // gets a dialog that names exactly what is lost, not a two-click arm.
  const [confirming, setConfirming] = useState(false);

  const reset = useAction(
    useCallback(async () => {
      // Only clear the local copy after the server-side DELETE succeeds. The
      // polling hook re-fetches every 2.5s; clearing on failure would let the
      // next poll snap the bracket back into ``data``.
      await api.remove();
      setData(null);
      setConfirming(false);
    }, [api, setData]),
    { errorMessage: 'Could not reset the bracket' },
  );

  return (
    <div>
      <Section title="Export">
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
      </Section>
      <Section title="Danger zone">
      <Row
        label="Reset bracket"
        control={
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center rounded-sm border border-destructive/40 bg-card px-3 py-1 text-2xs font-medium text-destructive hover:bg-destructive/10"
          >
            Reset bracket
          </button>
        }
        last
      />
      </Section>

      {confirming && (
        <Modal
          onClose={() => !reset.pending && setConfirming(false)}
          titleId="reset-bracket-heading"
        >
          <div className="p-6">
            <h2
              id="reset-bracket-heading"
              className="text-base font-semibold text-foreground"
            >
              Reset the bracket?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Every draw, schedule and recorded result in this bracket is
              discarded. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-between">
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={reset.pending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void reset.run()}
                disabled={reset.pending}
                aria-busy={reset.pending}
              >
                {reset.pending ? 'Resetting…' : 'Reset bracket'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
