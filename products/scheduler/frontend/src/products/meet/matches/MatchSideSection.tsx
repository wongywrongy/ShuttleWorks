/**
 * One side of a match, inside the match detail pane.
 *
 * This is where "who plays this side" is edited since the console-IA pass
 * moved the editors out of the row (§0, §1). The pane's own row used to carry
 * four player buttons and five delete buttons, with `✕ remove player` and
 * `✕ remove match` 23px apart at the right edge (finding 1.10). Here the two
 * gestures are a section apart, and removing a player is the canon two-click
 * arm sitting BESIDE the disclosure button rather than inside it — a
 * destructive control never shares a click target with a safe one.
 *
 * Cards expand in place to the shared roster field blocks, so an availability
 * or event edit made here writes the CANONICAL roster record.
 */
import { useMemo, useRef, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { DetailPanel, PickerPopover } from '../../../components/control-plane';
import { ConfirmDeleteButton } from '../../../components/ConfirmDeleteButton';
import { SchoolChip } from '../../../components/SchoolChip';
import {
  buildGroupIndex,
  getPlayerSchoolAccent,
  type SchoolAccent,
} from '../../../lib/schoolAccent';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';
import {
  PlayerAvailabilityField,
  PlayerEventsField,
} from '../roster/PlayerFields';
import { MatchPlayerPicker } from './MatchPlayerPicker';

export function MatchSideSection({
  label,
  ids,
  onChange,
  capacity,
  eventRank,
  players,
  groups,
}: {
  label: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  capacity: number;
  eventRank?: string | null;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const groupsById = useMemo(() => buildGroupIndex(groups), [groups]);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const slug = label.replace(/\s+/g, '-').toLowerCase();
  const atCapacity = ids.length >= capacity;

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pick = (id: string) => {
    if (ids.includes(id)) {
      onChange(ids.filter((x) => x !== id));
      return;
    }
    // Singles: picking replaces, and there is nothing else to choose, so the
    // picker closes. Doubles: append while there is room and stay open for
    // the partner; at capacity the operator removes one first.
    if (capacity === 1) {
      onChange([id]);
      setPickerOpen(false);
      return;
    }
    if (ids.length < capacity) onChange([...ids, id]);
  };

  return (
    <DetailPanel.Section
      eyebrow={label}
      testId={`match-side-${slug}`}
      right={
        <span className="text-2xs tabular-nums text-muted-foreground">
          {ids.length}/{capacity}
        </span>
      }
    >
      <div className="flex flex-col gap-1.5">
        {ids.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
            No players assigned
          </p>
        ) : (
          ids.map((id) => {
            const player = players.find((p) => p.id === id) ?? null;
            return (
              <PlayerCard
                key={id}
                id={id}
                side={label}
                player={player}
                accent={getPlayerSchoolAccent(player, groupsById)}
                open={openIds.has(id)}
                onToggle={() => toggle(id)}
                onRemove={() => onChange(ids.filter((x) => x !== id))}
              />
            );
          })
        )}

        <PickerPopover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PickerPopover.Anchor asChild>
            <div ref={anchorRef}>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                disabled={atCapacity}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                data-testid={`side-add-${slug}`}
                title={
                  atCapacity
                    ? `${label} is full. Remove a player first.`
                    : `Add player to ${label}`
                }
                className="w-full rounded-sm border border-dashed border-border px-2 py-1 text-xs italic text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                ＋ Add player
              </button>
            </div>
          </PickerPopover.Anchor>
          <PickerPopover.Panel aria-label={`${label} players`} guardRef={anchorRef}>
            <MatchPlayerPicker
              players={players}
              groups={groups}
              selected={ids}
              eligibleForRank={eventRank}
              onPick={pick}
            />
          </PickerPopover.Panel>
        </PickerPopover>
      </div>
    </DetailPanel.Section>
  );
}

function PlayerCard({
  id,
  side,
  player,
  accent,
  open,
  onToggle,
  onRemove,
}: {
  id: string;
  side: string;
  player: PlayerDTO | null;
  accent: SchoolAccent;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  if (!player) {
    // Stale reference (player deleted from the roster) — surface it instead
    // of silently dropping the slot; nothing to edit, but it can be removed.
    return (
      <div className="group flex items-center gap-2 rounded-sm border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 break-words italic">{id}</span>
        <span className="shrink-0 text-2xs">Not on roster</span>
        <ConfirmDeleteButton
          label={`${id} from ${side}`}
          onConfirm={onRemove}
          testId={`side-remove-${id}`}
        />
      </div>
    );
  }
  return (
    <div className="group overflow-hidden rounded-sm border border-border">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          data-testid={`match-player-card-${id}`}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left transition-colors duration-fast ease-brand hover:bg-muted/40"
        >
          <CaretRight
            aria-hidden
            weight="bold"
            className={[
              'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
              open ? 'rotate-90' : '',
            ].join(' ')}
          />
          <span className="min-w-0 flex-1 break-words text-sm text-foreground">
            {player.name || '(unnamed)'}
          </span>
          {/* Short-code chip, not the full school name (G6/M2.6) — the
              full name stays one hover away in the chip's tooltip. */}
          <SchoolChip accent={accent} />
        </button>
        <ConfirmDeleteButton
          label={`${player.name || 'player'} from ${side}`}
          onConfirm={onRemove}
          className="mr-1"
          testId={`side-remove-${id}`}
        />
      </div>
      {open ? (
        <div className="border-t border-border/60">
          <DetailPanel.Section eyebrow="Availability">
            <PlayerAvailabilityField player={player} />
          </DetailPanel.Section>
          <DetailPanel.Section eyebrow="Events">
            <PlayerEventsField player={player} />
          </DetailPanel.Section>
        </div>
      ) : null}
    </div>
  );
}
