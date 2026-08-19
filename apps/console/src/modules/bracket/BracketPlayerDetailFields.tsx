/**
 * The Bracket roster panel's body: IDENTITY / AVAILABILITY / EVENTS / NOTES.
 *
 * Four `DetailPanel.Section`s in the order Meet's player panel uses — who
 * they are, when they can play, what they play, free text last. It was a flat
 * `flex flex-col gap-3` with no headings, in a different order and a different
 * label recipe from Meet's (console IA pass, Theme 2).
 *
 * The text fields are CONTROLLED and commit on change. They were uncontrolled
 * `defaultValue` + `onBlur`, and Escape closes the panel (`DetailPanel.tsx`)
 * — which unmounts the input, and React does not reliably fire blur on
 * unmount. Type a note, press Escape, the note was gone, with no test
 * covering it (defect D9). Committing on change cannot lose an edit to any
 * dismissal path, present or future.
 */
import { DetailPanel } from '../../components/control-plane';
import { Row } from '../../platform/engine-config/SettingsControls';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import type { BadgeEntry } from './rosterEvents';
import {
  BracketAvailabilityField,
  BracketEventsField,
  FIELD_INPUT_CLASSES,
  type CommitEventFn,
} from './BracketPlayerFields';

export function BracketPlayerDetailFields({
  player,
  roster,
  bracketData,
  badges,
  onUpdate,
  onCommitEvent,
}: {
  player: BracketPlayerDTO;
  roster: BracketPlayerDTO[];
  bracketData: BracketTournamentDTO | null;
  badges: BadgeEntry[];
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
  onCommitEvent: CommitEventFn | null;
}) {
  return (
    <>
      {/* The name itself is the panel header — repeating it here would be a
          second copy in a 380px pane. What identity adds is the stable key
          the exports, the draw participants and the URLs all use. */}
      <DetailPanel.Section eyebrow="Identity">
        <Row pane
          last
          label="Roster ID"
          control={
            <span className="text-xs text-muted-foreground sw-num">
              {player.id}
            </span>
          }
        />
      </DetailPanel.Section>

      <DetailPanel.Section eyebrow="Availability">
        <div className="flex flex-col gap-1">
          <BracketAvailabilityField
            player={player}
            bracketData={bracketData}
            onUpdate={onUpdate}
          />
        </div>
        <Row pane
          last
          label="Min rest (slots)"
          control={
            <input
              type="number"
              min={0}
              value={player.restSlots != null ? String(player.restSlots) : ''}
              placeholder="default (1)"
              aria-label="Min rest (slots)"
              onChange={(e) => {
                const raw = e.target.value;
                const next = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
                if (next !== player.restSlots) {
                  onUpdate(player.id, { restSlots: next });
                }
              }}
              className={`${FIELD_INPUT_CLASSES} sw-num w-28`}
            />
          }
        />
      </DetailPanel.Section>

      <DetailPanel.Section
        eyebrow="Events"
        right={
          <span className="text-2xs text-muted-foreground sw-num">
            {badges.length === 0 ? 'None entered' : `${badges.length} entered`}
          </span>
        }
      >
        <BracketEventsField
          player={player}
          roster={roster}
          bracketData={bracketData}
          badges={badges}
          onCommitEvent={onCommitEvent}
        />
      </DetailPanel.Section>

      <DetailPanel.Section eyebrow="Notes">
        <input
          type="text"
          value={player.notes ?? ''}
          aria-label="Notes"
          placeholder="Anything the director should know"
          onChange={(e) => onUpdate(player.id, { notes: e.target.value })}
          className={FIELD_INPUT_CLASSES}
        />
      </DetailPanel.Section>
    </>
  );
}
