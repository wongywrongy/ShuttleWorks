/**
 * MatchPlayerPicker — the option list for "who plays this side".
 *
 * Rostered players whose `ranks[]` already hold the match's event come first
 * under an "Eligible for {rank}" heading (the Roster page's own answer, one
 * click away); everyone else follows grouped by school, because a
 * mid-tournament reassignment still has to be possible — the validator raises
 * the `stale-rank` warning when the operator steps outside the configured
 * roster.
 *
 * It renders options and nothing else: no popover, no capacity rule, no write
 * path. Lifted out of `MatchesSpreadsheet` when the editors left the row for
 * the detail pane (console-IA §1/§4) — the list itself was never the problem.
 */
import { useMemo } from 'react';
import { Check } from '@phosphor-icons/react';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';

function playerLabel(p: PlayerDTO, groups: RosterGroupDTO[]): string {
  const school = groups.find((g) => g.id === p.groupId)?.name ?? '?';
  return `${p.name || '(unnamed)'} · ${school}`;
}

function PickerRow({
  player,
  groups,
  selected,
  onClick,
}: {
  player: PlayerDTO;
  groups: RosterGroupDTO[];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`match-player-option-${player.id}`}
      className={[
        'flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-xs',
        'transition-colors duration-fast ease-brand',
        selected ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted/40',
      ].join(' ')}
    >
      <span>{playerLabel(player, groups)}</span>
      {selected ? (
        <Check aria-label="Selected" className="h-3.5 w-3.5 text-accent" />
      ) : null}
    </button>
  );
}

export function MatchPlayerPicker({
  players,
  groups,
  selected,
  eligibleForRank,
  onPick,
}: {
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  /** Player ids already on this side. */
  selected: string[];
  /** The match's event rank, when set — drives the "Eligible for" section. */
  eligibleForRank?: string | null;
  onPick: (playerId: string) => void;
}) {
  const eligible = useMemo(() => {
    if (!eligibleForRank) return [] as PlayerDTO[];
    return players.filter((p) => (p.ranks ?? []).includes(eligibleForRank));
  }, [players, eligibleForRank]);

  const restByGroup = useMemo(() => {
    const eligibleIds = new Set(eligible.map((p) => p.id));
    const by = new Map<string, PlayerDTO[]>();
    for (const p of players) {
      if (eligibleIds.has(p.id)) continue;
      if (!by.has(p.groupId)) by.set(p.groupId, []);
      by.get(p.groupId)!.push(p);
    }
    return by;
  }, [players, eligible]);

  if (players.length === 0) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        No players. Add some in the Roster tab.
      </p>
    );
  }

  return (
    <>
      {eligible.length > 0 ? (
        <div className="mb-1">
          <div className="mb-0.5 flex items-baseline justify-between px-1 text-3xs font-semibold uppercase tracking-wider text-accent">
            <span>Eligible for {eligibleForRank}</span>
            <span className="text-muted-foreground tabular-nums">
              {eligible.length}
            </span>
          </div>
          <div className="space-y-0.5">
            {eligible.map((p) => (
              <PickerRow
                key={p.id}
                player={p}
                groups={groups}
                selected={selected.includes(p.id)}
                onClick={() => onPick(p.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {restByGroup.size > 0 ? (
        <div>
          {eligible.length > 0 ? (
            <div className="mb-0.5 px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
              All other rostered
            </div>
          ) : null}
          {[...restByGroup.entries()].map(([groupId, list]) => (
            <div key={groupId} className="mb-1 last:mb-0">
              <div className="mb-0.5 px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                {groups.find((gr) => gr.id === groupId)?.name ?? 'Unassigned'}
              </div>
              <div className="space-y-0.5">
                {list.map((p) => (
                  <PickerRow
                    key={p.id}
                    player={p}
                    groups={groups}
                    selected={selected.includes(p.id)}
                    onClick={() => onPick(p.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
