/**
 * In-grid participant picker. Renders below the active Draws row,
 * in flow (no popover). Singles = multi-select roster picker, Doubles =
 * 2-step pair-select (commit pair as a TEAM participant).
 *
 * Both steps run on the shared `EventPicker`: 76 roster names used to render
 * as a flat two-column checkbox list with no search and no grouping, putting
 * Commit ~800px down a 380px dock (console IA pass, Theme 4). The picker
 * groups by initial, grows a search box past 10 names, and carries its own
 * "N selected" readout — so the list scrolls inside a bounded box and Commit
 * stays on screen.
 */
import { useState } from 'react';
import type { BracketPlayerDTO } from '../../api/dto';
import { Button } from '@scheduler/design-system';
import { EventPicker, type EventPickerOption } from '../../components/control-plane';
import { EYEBROW_CLASS } from '../../lib/utils';
import { teamName } from './bracketLabels';
import { nextTeamId } from './rosterEvents';

/** R-DM-2(a): the roster player already holds the person key, so a pick that
 *  drops it commits a NULL-keyed `bracket_participants` row for somebody the
 *  entries commit seam identified. Optional and omitted-when-absent, never
 *  nulled — `toUpsertParticipant`'s idiom, and absent is what the wire means
 *  by "no key". */
export interface PickedSingle {
  id: string;
  name: string;
  entryPlayerId?: string;
}

export interface PickedPair {
  id: string;
  name: string;
  /** The two members of a pair this picker formed, or of a team the entries
   *  commit seam built. ABSENT for a row the two-step picker cannot
   *  represent — a singleton left in a doubles draw by a commit made before
   *  F-DM-13 widened `BD` from singles to doubles. Those ride through
   *  verbatim rather than being reshaped into a team, which would be the
   *  picker deciding something; commit replaces the list, so dropping them
   *  would delete real entrants. */
  members?: string[];
  /** A team row carries ONE key, and it is the nominating player's — the
   *  same half `members[0]` names. */
  entryPlayerId?: string;
}

interface Props {
  mode: 'singles' | 'doubles';
  eventId: string;
  players: BracketPlayerDTO[];
  initialIds: string[];
  /** The doubles seed (debt-log.md:96). Commit REPLACES the event's
   *  participant list, so a doubles picker that opens empty deletes every
   *  team already entered the moment one new pair is saved — and from
   *  SP-DM-3 P5 those are the teams the entries commit seam built from two
   *  humans' agreement. Ignored by the singles branch, which seeds from
   *  `initialIds` (a doubles seed cannot: its ids are TEAM ids while the
   *  list and its `unavailable` set are keyed on PLAYER ids). */
  initialPairs: PickedPair[];
  onCommit: (picks: PickedSingle[] | PickedPair[]) => void;
  onCancel: () => void;
}

/** The list box the picker scrolls inside. `EventPicker` owns no height by
 *  design ("Height and scroll belong to whatever holds it"); bounding it here
 *  is what keeps Commit above the fold. */
const LIST_BOX = 'max-h-64 overflow-y-auto rounded-sm border border-border bg-card p-1';

/**
 * Roster names as picker options, sorted and grouped by the name's initial.
 *
 * The group key is the operator's own data — never a lookup into a fixed
 * label map, which is how "BS1 - undefined 1" ships today (defect D1).
 */
function playerOptions(
  players: BracketPlayerDTO[],
  disabledIds?: ReadonlySet<string>,
): EventPickerOption[] {
  return [...players]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      id: p.id,
      code: p.name || '(unnamed)',
      discipline: (p.name.trim()[0] ?? '?').toUpperCase(),
      disabled: disabledIds?.has(p.id),
    }));
}

export function ParticipantPicker({
  mode,
  eventId,
  players,
  initialIds,
  initialPairs,
  onCommit,
  onCancel,
}: Props) {
  if (mode === 'singles') {
    return (
      <SinglesPicker
        players={players}
        initialIds={initialIds}
        onCommit={onCommit as (picks: PickedSingle[]) => void}
        onCancel={onCancel}
      />
    );
  }
  return (
    <DoublesPicker
      eventId={eventId}
      players={players}
      initialPairs={initialPairs}
      onCommit={onCommit as (picks: PickedPair[]) => void}
      onCancel={onCancel}
    />
  );
}

function SinglesPicker({
  players,
  initialIds,
  onCommit,
  onCancel,
}: {
  players: BracketPlayerDTO[];
  initialIds: string[];
  onCommit: (picks: PickedSingle[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(initialIds);
  return (
    <div className="flex flex-col gap-2">
      <div className={`${EYEBROW_CLASS} text-muted-foreground`}>
        Pick participants ({picked.length})
      </div>
      <div className={LIST_BOX}>
        <EventPicker
          multiple
          options={playerOptions(players)}
          ariaLabel="Participants"
          testId="participant-picker"
          value={picked}
          onChange={setPicked}
          emptyLabel="No players match this search."
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant="brand"
          size="sm"
          onClick={() =>
            onCommit(
              picked
                .map((id) => players.find((p) => p.id === id))
                .filter((p): p is BracketPlayerDTO => p != null)
                .map((p) => ({
                  id: p.id,
                  name: p.name,
                  ...(p.entryPlayerId != null ? { entryPlayerId: p.entryPlayerId } : {}),
                })),
            )
          }
        >
          Save participants
        </Button>
      </div>
    </div>
  );
}

function DoublesPicker({
  eventId,
  players,
  initialPairs,
  onCommit,
  onCancel,
}: {
  eventId: string;
  players: BracketPlayerDTO[];
  initialPairs: PickedPair[];
  onCommit: (picks: PickedPair[]) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'A' | 'B'>('A');
  const [pickedA, setPickedA] = useState<BracketPlayerDTO | null>(null);
  const [pairs, setPairs] = useState<PickedPair[]>(initialPairs);

  // Already paired (either step) plus, on step B, the player chosen for A.
  // A row with no members is a singleton and ITS id is the player id —
  // without the fallback one save could enter the same human twice, once as
  // a PLAYER row and once inside a new team. Length, not nullishness: the
  // wire admits `members: []` (bracketDto.ts:23) and the module's canonical
  // reading of that shape is "this row's id IS the person"
  // (rosterEvents.ts:79). `??` would let `[]` name nobody.
  const unavailable = new Set(
    pairs.flatMap((pair) => (pair.members?.length ? pair.members : [pair.id])),
  );
  if (step === 'B' && pickedA) unavailable.add(pickedA.id);

  const pick = (id: string | null) => {
    const p = id ? players.find((x) => x.id === id) : null;
    if (!p) return;
    if (step === 'A') {
      setPickedA(p);
      setStep('B');
      return;
    }
    if (!pickedA) return;
    setPairs((arr) => [
      ...arr,
      {
        // Max-suffix + 1, not sequence position: the list now opens seeded,
        // so a draw holding only `XD-T2` would otherwise mint a second one.
        id: nextTeamId(eventId, arr),
        name: teamName(pickedA.name, p.name),
        members: [pickedA.id, p.id],
        ...(pickedA.entryPlayerId != null ? { entryPlayerId: pickedA.entryPlayerId } : {}),
      },
    ]);
    setPickedA(null);
    setStep('A');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={`${EYEBROW_CLASS} text-muted-foreground`}>
        {step === 'A'
          ? `Pick player A (pair ${pairs.length + 1})`
          : `Pick partner for ${pickedA?.name}`}
      </div>
      <div className={LIST_BOX}>
        <EventPicker
          options={playerOptions(players, unavailable)}
          ariaLabel={step === 'A' ? 'Player A' : 'Partner'}
          testId="participant-picker"
          value={null}
          onChange={pick}
          emptyLabel="No players match this search."
        />
      </div>
      {pairs.length > 0 && (
        <ul className="text-2xs text-muted-foreground space-y-0.5">
          {pairs.map((pair) => (
            <li key={pair.id}>{pair.name}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant="brand"
          size="sm"
          disabled={pairs.length === 0 || step === 'B'}
          title={
            pairs.length === 0
              ? 'Form at least one pair to save'
              : step === 'B'
                ? 'Finish the current pair first'
                : ''
          }
          onClick={() => onCommit(pairs)}
        >
          Save pairs
        </Button>
      </div>
    </div>
  );
}
