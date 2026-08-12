/**
 * DrawDetailPanel — the right-docked detail drawer for one draw (spec:
 * meet/bracket unification §2). Hosts what the old draw card kept
 * inline: a config summary and the participant picker. Actions stay on
 * the table row; this panel is for inspecting and entering.
 *
 * Both blocks are `DetailPanel.Section`s — the panel owns the label recipe,
 * so this file no longer re-types one (console IA pass, Theme 2).
 */
import { DetailPanel } from '../../components/control-plane';
import { ParticipantPicker, type PickedSingle, type PickedPair } from './ParticipantPicker';
import type { BracketEventDTO } from './eventUpsertPayload';
import { formatLabel, disciplineLabel } from './bracketLabels';

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
  const entered = ev.participants ?? [];
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
      <DetailPanel.Section eyebrow="Configuration">
        <dl className="space-y-1 text-xs">
          {/* Format is already the header's sub-line — no need to repeat
              it here (and repeating it would collide with a plain-text
              query for "Single elimination" finding two elements). */}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Bracket size</dt>
            <dd className="sw-num">{ev.bracket_size ?? '–'}</dd>
          </div>
          {configEntries.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
              <dd className="sw-num">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </DetailPanel.Section>

      <DetailPanel.Section
        eyebrow="Participants"
        right={
          <span className="text-2xs text-muted-foreground sw-num">
            {ev.participant_count ?? 0} entered
          </span>
        }
      >
        <ParticipantPicker
          mode={isDoubles ? 'doubles' : 'singles'}
          eventId={ev.id}
          players={players}
          // Commit REPLACES the event's participant list, so the singles
          // picker has to open holding what is already entered: seeded with
          // [] it silently dropped everyone the operator didn't re-tick.
          initialIds={isDoubles ? [] : entered.map((p) => p.id)}
          onCommit={onCommitPicks}
          onCancel={onClose}
        />
      </DetailPanel.Section>
    </DetailPanel>
  );
}
