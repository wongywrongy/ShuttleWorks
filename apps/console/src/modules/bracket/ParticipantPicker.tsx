/**
 * In-grid participant picker. Renders below the active Draws row,
 * in flow (no popover). Singles = multi-select roster picker, Doubles =
 * 2-step pair-select (commit pair as a TEAM participant).
 *
 * Both steps run on the shared dense-record table: candidate and existing-pair
 * records keep one fixed-height row, with a local search toolbar for longer
 * rosters. The list scrolls inside a bounded box and Commit stays on screen.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { BracketPlayerDTO } from "../../api/dto";
import { Button } from "@scheduler/design-system";
import {
  DEFAULT_DENSE_DATA_STATE,
  DenseDataTable,
  DenseDataToolbar,
  type DenseDataColumn,
  type DenseDataState,
} from "../../components/control-plane";
import { OverflowMenu } from "../../components/control-plane/OverflowMenu";
import { EYEBROW_CLASS } from "../../lib/utils";
import { formatPlayerName, formatSideName } from "../../lib/names";
import { teamName } from "./bracketLabels";
import { nextTeamId } from "./rosterEvents";

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
  mode: "singles" | "doubles";
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
  /** Pair actions are deliberately callbacks: the owning surface routes
   * changes through the canonical Bracket event mutation seam. */
  onOpenPlayer?: (playerId: string) => void;
  onChangePartner?: (pair: PickedPair) => void;
  onDissolvePair?: (pair: PickedPair) => void;
}

/** The list box the picker scrolls inside; bounding it here keeps Commit above
 * the fold while the shared table owns row geometry. */
const LIST_BOX =
  "max-h-64 overflow-y-auto rounded-sm border border-border bg-card p-1";

/**
 * Roster names as picker records, sorted by the identity supplied by the
 * caller. Grouping is deliberately absent: one record is one strict row.
 */
interface PickerRecord {
  id: string;
  name: string;
  status?: string;
  disabled?: boolean;
}

function playerOptions(
  players: BracketPlayerDTO[],
  disabledIds?: ReadonlySet<string>,
  statusById?: ReadonlyMap<string, string>,
  rankById?: ReadonlyMap<string, number>,
): PickerRecord[] {
  return [...players]
    .sort((a, b) => {
      const rank = (rankById?.get(a.id) ?? 1) - (rankById?.get(b.id) ?? 1);
      return rank || a.name.localeCompare(b.name);
    })
    .map((p) => ({
      id: p.id,
      name: formatPlayerName(p.name || "(unnamed)"),
      status: statusById?.get(p.id),
      disabled: disabledIds?.has(p.id),
    }));
}

/**
 * The picker and its existing-pairs readout are both strict record tables.
 * Keeping the radio/checkbox inside the shared primitive preserves the old
 * selection contract while giving both lists one row geometry (F-PAIR-03/
 * F-PAIR-04). The state is intentionally local: picker search must not add
 * draw-page query parameters while an operator is making a selection.
 */
function PickerRecordTable({
  records,
  multiple = false,
  selectedIds = [],
  onPick,
  ariaLabel,
  className,
  renderActions,
}: {
  records: readonly PickerRecord[];
  multiple?: boolean;
  selectedIds?: readonly string[];
  onPick?: (id: string) => void;
  ariaLabel: string;
  className?: string;
  renderActions?: (record: PickerRecord) => ReactNode;
}) {
  const [state, setState] = useState<DenseDataState>(DEFAULT_DENSE_DATA_STATE);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const columns = useMemo<DenseDataColumn<PickerRecord>[]>(() => {
    const name: DenseDataColumn<PickerRecord> = {
      id: "name",
      label: ariaLabel,
      accessor: (record) => record.name,
      className: "min-w-0",
    };
    return records.some((record) => record.status)
      ? [
          name,
          {
            id: "status",
            label: "Status",
            accessor: (record) => record.status,
            className: "w-36",
          },
        ]
      : [name];
  }, [ariaLabel, records]);

  return (
    <div className={className} data-testid={`${className ?? "picker"}-table`}>
      {records.length > 10 ? (
        <DenseDataToolbar
          state={state}
          onStateChange={setState}
          searchPlaceholder="Search players"
        />
      ) : null}
      <DenseDataTable
        rows={records}
        columns={columns}
        state={state}
        onStateChange={setState}
        rowId={(record) => record.id}
        renderLeading={
          onPick
            ? (record) => (
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={multiple ? undefined : ariaLabel}
                  aria-label={record.name}
                  checked={selected.has(record.id)}
                  disabled={record.disabled}
                  onChange={() => onPick(record.id)}
                  className="h-3.5 w-3.5 shrink-0 accent-accent"
                />
              )
            : undefined
        }
        renderActions={renderActions}
        strictRows
        elasticColumnId="name"
        showPagination={false}
        emptyState="No players match this search."
      />
    </div>
  );
}

export function ParticipantPicker({
  mode,
  eventId,
  players,
  initialIds,
  initialPairs,
  onCommit,
  onCancel,
  onOpenPlayer,
  onChangePartner,
  onDissolvePair,
}: Props) {
  if (mode === "singles") {
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
      onOpenPlayer={onOpenPlayer}
      onChangePartner={onChangePartner}
      onDissolvePair={onDissolvePair}
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
        <PickerRecordTable
          records={playerOptions(players)}
          multiple
          selectedIds={picked}
          onPick={(id) =>
            setPicked((current) =>
              current.includes(id)
                ? current.filter((selectedId) => selectedId !== id)
                : [...current, id],
            )
          }
          ariaLabel="Participants"
          className="participant-picker"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
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
                  ...(p.entryPlayerId != null
                    ? { entryPlayerId: p.entryPlayerId }
                    : {}),
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
  onOpenPlayer,
  onChangePartner,
  onDissolvePair,
}: {
  eventId: string;
  players: BracketPlayerDTO[];
  initialPairs: PickedPair[];
  onCommit: (picks: PickedPair[]) => void;
  onCancel: () => void;
  onOpenPlayer?: (playerId: string) => void;
  onChangePartner?: (pair: PickedPair) => void;
  onDissolvePair?: (pair: PickedPair) => void;
}) {
  const [step, setStep] = useState<"A" | "B">("A");
  const [pickedA, setPickedA] = useState<BracketPlayerDTO | null>(null);
  const [pickedB, setPickedB] = useState<BracketPlayerDTO | null>(null);
  const [pairs, setPairs] = useState<PickedPair[]>(initialPairs);
  const [changeWarning, setChangeWarning] = useState<PickedPair | null>(null);
  const [replacementWarning, setReplacementWarning] = useState<{
    pair: PickedPair;
    player: BracketPlayerDTO;
  } | null>(null);

  // Already paired (either step) plus, on step B, the player chosen for A.
  // A row with no members is a singleton and ITS id is the player id —
  // without the fallback one save could enter the same human twice, once as
  // a PLAYER row and once inside a new team. Length, not nullishness: the
  // wire admits `members: []` (bracketDto.ts:23) and the module's canonical
  // reading of that shape is "this row's id IS the person"
  // (rosterEvents.ts:79). `??` would let `[]` name nobody.
  const singletonIds = new Set(
    pairs
      .filter((pair) => !pair.members?.length)
      .map((pair) => pair.id),
  );
  const pairedWith = new Map<string, string>();
  pairs.forEach((pair) => {
    if (!pair.members || pair.members.length < 2) return;
    const [a, b] = pair.members;
    if (a && b) {
      pairedWith.set(a, b);
      pairedWith.set(b, a);
    }
  });
  const playerNames = new Map(
    players.map((player) => [player.id, formatPlayerName(player.name)]),
  );
  // Existing pairs remain visible AND selectable. An operator may be
  // replacing a partner, so legality is guarded by an explicit warning at
  // selection time rather than by hiding or disabling the candidate.
  const unavailable = new Set<string>();
  if (step === "B" && pickedA) unavailable.add(pickedA.id);

  const candidateStatus = new Map<string, string>();
  singletonIds.forEach((playerId) => candidateStatus.set(playerId, "Entered"));
  pairedWith.forEach((partnerId, playerId) => {
    const partnerName = playerNames.get(partnerId);
    candidateStatus.set(
      playerId,
      partnerName ? `Paired with ${partnerName}` : "Paired",
    );
  });
  const candidateRank = new Map<string, number>();
  singletonIds.forEach((id) => candidateRank.set(id, 0));
  players.forEach((player) => {
    if (!candidateRank.has(player.id) && !pairedWith.has(player.id)) {
      candidateRank.set(player.id, 1);
      candidateStatus.set(player.id, "Not entered");
    } else if (pairedWith.has(player.id)) {
      candidateRank.set(player.id, 2);
    }
  });

  const makePair = (): PickedPair | null => {
    if (!pickedA || !pickedB) return null;
    return {
      id: nextTeamId(eventId, pairs),
      name: teamName(pickedA.name, pickedB.name),
      members: [pickedA.id, pickedB.id],
      ...(pickedA.entryPlayerId != null
        ? { entryPlayerId: pickedA.entryPlayerId }
        : {}),
    };
  };

  const confirmPair = (): PickedPair[] | null => {
    const nextPair = makePair();
    if (!nextPair) return null;
    // A singleton is an entered player awaiting a partner. Forming a pair
    // consumes that row; an explicitly approved replacement removes the old
    // TEAM row before the new one is written.
    const nextPairs = [
      ...pairs.filter((pair) => {
        const members = pair.members?.length ? pair.members : [pair.id];
        return !members.includes(pickedA!.id) && !members.includes(pickedB!.id);
      }),
      nextPair,
    ];
    setPairs(nextPairs);
    setPickedA(null);
    setPickedB(null);
    setStep("A");
    return nextPairs;
  };

  const pick = (id: string | null) => {
    const p = id ? players.find((x) => x.id === id) : null;
    if (!p) return;
    const pairedPlayer = pairedWith.get(p.id);
    if (pairedPlayer) {
      const pair = pairs.find((candidate) =>
        candidate.members?.includes(p.id),
      );
      if (pair) {
        setReplacementWarning({ pair, player: p });
        return;
      }
    }
    if (step === "A") {
      setPickedA(p);
      setStep("B");
      return;
    }
    if (!pickedA) return;
    setPickedB(p);
  };

  const savePairs = () => {
    const nextPairs = pickedB ? confirmPair() : pairs;
    if (nextPairs) onCommit(nextPairs);
  };

  const confirmReplacement = () => {
    if (!replacementWarning) return;
    const { pair, player } = replacementWarning;
    setPairs((current) => current.filter((candidate) => candidate.id !== pair.id));
    setReplacementWarning(null);
    if (step === "A") {
      setPickedA(player);
      setStep("B");
    } else {
      setPickedB(player);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={`${EYEBROW_CLASS} text-muted-foreground`}>
        {step === "A"
          ? "Pick player A"
          : `Pick partner for ${pickedA ? formatPlayerName(pickedA.name) : ""}`}
      </div>
      <div className={LIST_BOX}>
        <PickerRecordTable
          records={playerOptions(
            players,
            unavailable,
            candidateStatus,
            candidateRank,
          )}
          selectedIds={[pickedA?.id, pickedB?.id].filter(
            (id): id is string => id != null,
          )}
          onPick={pick}
          ariaLabel={step === "A" ? "Player A" : "Partner"}
          className="participant-picker"
        />
      </div>
      {pairs.length > 0 && (
        <PickerRecordTable
          records={pairs.map((pair) => ({
            id: pair.id,
            name: formatSideName(pair.name, " / "),
          }))}
          ariaLabel="Pairs"
          className="participant-pairs"
          renderActions={(record) => {
            const pair = pairs.find((candidate) => candidate.id === record.id);
            if (!pair) return null;
            return (
              <OverflowMenu
                label={`Actions for ${formatSideName(pair.name, " / ")}`}
                items={[
                  {
                    key: "open-player",
                    label: "Open player",
                    onSelect: () => {
                      const playerId = pair.members?.[0] ?? pair.id;
                      onOpenPlayer?.(playerId);
                    },
                  },
                  {
                    key: "change-partner",
                    label: "Change partner",
                    onSelect: () => setChangeWarning(pair),
                  },
                  {
                    key: "dissolve-pair",
                    label: "Dissolve pair",
                    destructive: true,
                    onSelect: () => onDissolvePair?.(pair),
                  },
                ]}
              />
            );
          }}
        />
      )}
      {changeWarning ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-sm border border-status-warning/40 bg-status-warning/10 px-2 py-1.5 text-xs"
        >
          <span className="min-w-0 flex-1">
            Changing partner will replace{" "}
            {formatSideName(changeWarning.name, " / ")}.
          </span>
          <Button
            variant="brand"
            size="xs"
            onClick={() => {
              const pair = changeWarning;
              setChangeWarning(null);
              onChangePartner?.(pair);
            }}
          >
            Confirm change
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setChangeWarning(null)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      {replacementWarning ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-sm border border-status-warning/40 bg-status-warning/10 px-2 py-1.5 text-xs"
        >
          <span className="min-w-0 flex-1">
            {formatPlayerName(replacementWarning.player.name)} is already paired with{" "}
            {playerNames.get(pairedWith.get(replacementWarning.player.id) ?? "") ?? "another player"}.
            Continuing will replace that pair.
          </span>
          <Button variant="brand" size="xs" onClick={confirmReplacement}>
            Confirm replacement
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setReplacementWarning(null)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="brand"
          size="sm"
          disabled={pairs.length === 0 && !pickedB}
          title={
            pairs.length === 0 && !pickedB
              ? "Form at least one pair to save"
              : ""
          }
          onClick={savePairs}
        >
          Save pairs
        </Button>
      </div>
    </div>
  );
}
