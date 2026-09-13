/**
 * The Bracket roster panel's body: IDENTITY / EVENT ENTRIES / AVAILABILITY /
 * INTERNAL NOTES — the one order D4 gives both engines' player panels.
 *
 * What each section owns:
 *  - Identity is a GROUPED edit with its own Save/Discard (D4): a select whose
 *    every keystroke wrote straight through gave "Representing" the same
 *    silent-commit treatment as a note, and representation is a fact about the
 *    person that an operator should be able to reconsider before saving.
 *    Unknown is the honest default and a real option, not an empty row.
 *  - Event entries states the current event AND the current partner WITHOUT
 *    expanding anything. The editor below it is still the disclosure; the
 *    answer to "who is this person playing with" is not.
 *  - Availability and Internal notes keep the existing debounced autosave —
 *    isolated fields, no grouped commit — now with that autosave's state
 *    visible (`AutosaveStatus`) instead of inferred.
 *
 * The text fields are CONTROLLED and commit on change. They were uncontrolled
 * `defaultValue` + `onBlur`, and Escape closes the panel (`DetailPanel.tsx`)
 * — which unmounts the input, and React does not reliably fire blur on
 * unmount. Type a note, press Escape, the note was gone, with no test
 * covering it (defect D9). Committing on change cannot lose an edit to any
 * dismissal path, present or future.
 */
import { useState } from 'react';
import { FormActions, Select } from '@scheduler/design-system';
import { DetailPanel } from '../../components/control-plane';
import { Row } from '../../platform/engine-config/SettingsControls';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import type { BracketPlayerDTO } from '../../api/dto';
import { isEnteredIn, partnerIdForPlayer, type BadgeEntry } from './rosterEvents';
import {
  BracketAvailabilityField,
  BracketEventsField,
  type CommitEventFn,
} from './BracketPlayerFields';
import { disciplineLabel } from './bracketLabels';
import { isDoublesCode } from '../../lib/doubles';
import { formatPersonName } from '../../platform/domain/sides';
import { INPUT_INLINE_CLASS } from '../../lib/utils';
import {
  REPRESENTATION_OPTIONS,
  UNKNOWN_REPRESENTATION_LABEL,
} from '../../lib/representations';
import { AutosaveStatus } from '../../components/AutosaveStatus';

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
  const slotMinutes = bracketData?.interval_minutes ?? null;
  return (
    <>
      <IdentitySection player={player} onUpdate={onUpdate} />

      <DetailPanel.Section
        eyebrow="Event entries"
        right={
          <span className="text-2xs text-muted-foreground sw-num">
            {badges.length === 0 ? 'None entered' : `${badges.length} entered`}
          </span>
        }
      >
        <EntrySummary player={player} roster={roster} bracketData={bracketData} />
        <BracketEventsField
          player={player}
          roster={roster}
          bracketData={bracketData}
          badges={badges}
          onCommitEvent={onCommitEvent}
        />
      </DetailPanel.Section>

      <DetailPanel.Section eyebrow="Availability" right={<AutosaveStatus />}>
        <div className="flex flex-col gap-1">
          <BracketAvailabilityField
            player={player}
            bracketData={bracketData}
            onUpdate={onUpdate}
          />
        </div>
        <Row pane
          last
          label="Minimum rest between matches"
          control={
            <span className="inline-flex items-baseline gap-2">
              <input
                type="number"
                min={0}
                value={player.restSlots != null ? String(player.restSlots) : ''}
                placeholder="default (1)"
                aria-label="Minimum rest between matches"
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
                  if (next !== player.restSlots) {
                    onUpdate(player.id, { restSlots: next });
                  }
                }}
                className={`${INPUT_INLINE_CLASS} sw-num w-24`}
              />
              <span className="text-xs text-muted-foreground">
                {slotMinutes ? `slots (${slotMinutes} min each)` : 'slots'}
              </span>
            </span>
          }
        />
      </DetailPanel.Section>

      <DetailPanel.Section eyebrow="Internal notes" right={<AutosaveStatus />}>
        <input
          type="text"
          value={player.notes ?? ''}
          aria-label="Internal notes"
          placeholder="Anything the director should know"
          onChange={(e) => onUpdate(player.id, { notes: e.target.value })}
          className={INPUT_INLINE_CLASS}
        />
      </DetailPanel.Section>
    </>
  );
}

/* =========================================================================
 * IdentitySection — the grouped identity edit. Draft in local state, one
 * explicit Save, Discard back to the record.
 * ========================================================================= */
function IdentitySection({
  player,
  onUpdate,
}: {
  player: BracketPlayerDTO;
  onUpdate: (id: string, updates: Partial<BracketPlayerDTO>) => void;
}) {
  const saved = player.representation ?? '';
  const [draft, setDraft] = useState(saved);
  const dirty = draft !== saved;
  return (
    <DetailPanel.Section
      eyebrow="Identity"
      right={
        dirty ? (
          <span role="status" className="text-2xs text-muted-foreground">
            Unsaved
          </span>
        ) : (
          <AutosaveStatus testId="identity-autosave-status" />
        )
      }
    >
      {/* No name row: the panel header already IS the person, and an internal
          roster id is not an operator task (F-PAIR-36, R-PAIR-6). */}
      <Row pane
        label="Representing"
        last
        control={
          <Select
            value={draft}
            onValueChange={(value) => setDraft(value)}
            options={REPRESENTATION_OPTIONS}
            ariaLabel="Representing"
            size="sm"
            clearable
            placeholder={UNKNOWN_REPRESENTATION_LABEL}
            triggerStyle={{ width: '13rem' }}
          />
        }
      />
      <FormActions
        dirty={dirty}
        className="mt-3 justify-end"
        onSave={() =>
          onUpdate(player.id, { representation: draft === '' ? undefined : draft })
        }
        onDiscard={() => setDraft(saved)}
      />
    </DetailPanel.Section>
  );
}

/* =========================================================================
 * EntrySummary — current event and current partner, always visible.
 * ========================================================================= */
function EntrySummary({
  player,
  roster,
  bracketData,
}: {
  player: BracketPlayerDTO;
  roster: BracketPlayerDTO[];
  bracketData: BracketTournamentDTO | null;
}) {
  const entered = (bracketData?.events ?? []).filter((ev) =>
    isEnteredIn(ev, player.id),
  );
  if (entered.length === 0) return null;
  return (
    <ul
      data-testid="entry-summary"
      className="mb-2 flex flex-col gap-0.5 text-xs text-foreground"
    >
      {entered.map((ev) => {
        const doubles = isDoublesCode(ev.discipline);
        const partnerId = doubles ? partnerIdForPlayer(ev, player.id) : null;
        const partner = partnerId
          ? roster.find((candidate) => candidate.id === partnerId)
          : undefined;
        return (
          <li key={ev.id} data-testid={`entry-summary-${ev.id}`}>
            <span className="font-medium sw-num">{ev.id}</span>{' '}
            <span className="text-muted-foreground">
              {disciplineLabel(ev.discipline)}
            </span>
            {doubles ? (
              <span className="text-muted-foreground">
                {' · '}
                {partner
                  ? `with ${formatPersonName(partner.name)}`
                  : 'partner missing'}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
