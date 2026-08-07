/**
 * DrawDetailPanel — the right-docked detail drawer for one draw (spec:
 * meet/bracket unification §2). Hosts what the old draw card kept
 * inline: a config summary and the participant picker. Actions stay on
 * the table row; this panel is for inspecting and entering.
 */
import { DetailPanel } from '../../components/control-plane';
import { ParticipantPicker, type PickedSingle, type PickedPair } from './ParticipantPicker';
import type { BracketEventDTO } from './eventUpsertPayload';
import { formatLabel, disciplineLabel } from './bracketLabels';
import { EYEBROW_CLASS } from '../../lib/utils';

const SECTION_LABEL =
  `${EYEBROW_CLASS} text-muted-foreground`;

export function DrawDetailPanel({
  ev,
  players,
  onClose,
  onCommitPicks,
}: {
  ev: BracketEventDTO;
  players: { id: string; name: string }[];
  onClose: () => void;
  /** Seed-preserving upsert lives with the surface that owns the data
   *  flow (BracketDrawsTab.commitPicks); the panel only forwards picks. */
  onCommitPicks: (picks: PickedSingle[] | PickedPair[]) => Promise<void>;
}) {
  const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
  const configEntries = Object.entries(ev.config ?? {});
  return (
    <DetailPanel
      variant="docked"
      label="Draw"
      value={ev.id}
      sub={`${disciplineLabel(ev.discipline)} · ${formatLabel(ev.format)}`}
      mono
      onClose={onClose}
      testId="draw-detail-panel"
    >
      <div className="space-y-4 p-3">
        <section>
          <h3 className={SECTION_LABEL}>Configuration</h3>
          <dl className="mt-1.5 space-y-1 text-xs">
            {/* Format is already the header's sub-line — no need to repeat
                it here (and repeating it would collide with a plain-text
                query for "Single elimination" finding two elements). */}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Bracket size</dt>
              <dd className="sw-num">{ev.bracket_size ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Entered</dt>
              <dd className="sw-num">{ev.participant_count ?? 0}</dd>
            </div>
            {configEntries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
                <dd className="sw-num">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className={SECTION_LABEL}>Participants</h3>
          <div className="mt-1.5 rounded-sm bg-bg-elev p-2">
            <ParticipantPicker
              mode={isDoubles ? 'doubles' : 'singles'}
              eventId={ev.id}
              players={players}
              initialIds={[]}
              onCommit={onCommitPicks}
              onCancel={onClose}
            />
          </div>
        </section>
      </div>
    </DetailPanel>
  );
}
