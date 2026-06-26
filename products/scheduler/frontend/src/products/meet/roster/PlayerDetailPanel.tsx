/**
 * PlayerDetailPanel — fills the Roster's right-hand pane when a player
 * is selected. It shares horizontal space with the position grid (the
 * grid reflows narrower) rather than stacking below it, so the lower
 * half of the screen is never wasted. The parent (RosterTab) mounts the
 * pane only while a player is selected; this component just fills it.
 *
 * Internals are single-column and fluid (label above control, controls
 * `w-full`) so everything fits the narrow pane without overflowing.
 *
 * Shows the same fields the (now-removed) inline RosterSpreadsheet
 * carried for one player: school, availability summary, min rest, notes,
 * ranks as toggleable pills. All edits flow through `updatePlayer` on
 * the app store.
 *
 * Dismissed by:
 *  • the × close button
 *  • clicking the same player in the left list a second time (handled
 *    in RosterTab — passes `onDismiss`)
 */
import { X } from '@phosphor-icons/react';
import { Select } from '@scheduler/design-system/components';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useRankAssignment } from './positionGrid/useRankAssignment';
import { useRankValidation } from './hooks/useRankValidation';
import { isDoublesRank } from './positionGrid/helpers';

interface Props {
  player: PlayerDTO | null;
  visible: boolean;
  onDismiss: () => void;
  groups: RosterGroupDTO[];
}

export function PlayerDetailPanel({
  player,
  visible,
  onDismiss,
  groups,
}: Props) {
  const updatePlayer = useTournamentStore((s) => s.updatePlayer);
  const { assignRank, unassignRank } = useRankAssignment();
  // Grouped ranks + per-rank eligibility (who holds it, whether full) for
  // this player's school, excluding the player themself.
  const { availableRanks, isRankFull } = useRankValidation(
    player?.groupId ?? null,
    player?.id,
  );

  // Pill toggle: removal is always safe; addition goes through the shared
  // singles-displacement invariant. A doubles rank already full with two
  // OTHER players is blocked here too, matching the grid cell's guard.
  const handleToggleRank = (rank: string) => {
    if (!player) return;
    if ((player.ranks ?? []).includes(rank)) {
      unassignRank(player.id, rank);
      return;
    }
    if (isDoublesRank(rank) && isRankFull(rank)) return;
    assignRank(player.groupId, player.id, rank);
  };

  return (
    <div
      data-testid="player-detail-panel"
      aria-hidden={!visible}
      className="flex h-full w-full flex-col bg-card text-foreground animate-block-in"
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Player details
          </span>
          {player ? (
            <span className="text-sm font-semibold text-foreground">
              {player.name || '(unnamed)'}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close player details"
          className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted/60 hover:text-foreground"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      {player ? (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* Single-column, label-above-control — fits the narrow right
              pane without overflowing (the old fixed widths were sized
              for the full-width bottom dock). */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">School</label>
              <Select
                value={player.groupId}
                onValueChange={(v) =>
                  updatePlayer(player.id, { groupId: v })
                }
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
                ariaLabel="School"
                size="sm"
                triggerStyle={{ width: '100%' }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Availability</label>
              <span className="text-xs text-muted-foreground">
                {player.availability && player.availability.length > 0
                  ? `${player.availability.length} window${player.availability.length === 1 ? '' : 's'} defined`
                  : 'All day (no restrictions)'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="player-rest-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Min rest
              </label>
              <span className="inline-flex items-baseline gap-2">
                <input
                  id="player-rest-input"
                  type="number"
                  min={0}
                  max={120}
                  value={
                    player.minRestMinutes != null
                      ? String(player.minRestMinutes)
                      : ''
                  }
                  placeholder="default"
                  onChange={(e) => {
                    const raw = e.target.value;
                    updatePlayer(player.id, {
                      minRestMinutes:
                        raw === '' ? undefined : Number(raw) || 0,
                    });
                  }}
                  className="h-7 w-20 rounded-sm border border-border bg-bg-elev px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="player-notes-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Notes
              </label>
              <textarea
                id="player-notes-input"
                value={player.notes ?? ''}
                onChange={(e) =>
                  updatePlayer(player.id, {
                    notes: e.target.value || undefined,
                  })
                }
                rows={3}
                placeholder="Optional notes…"
                className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Ranks
              </label>
              {Object.keys(availableRanks).length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Configure positions in Setup to assign ranks.
                </span>
              ) : (
                Object.entries(availableRanks).map(([key, cat]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-7 shrink-0 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {key}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {cat.ranks.map((r) => {
                        const isActive = (player.ranks ?? []).includes(r.value);
                        const doubles = isDoublesRank(r.value);
                        // r.disabled = full by OTHER players (singles: 1, doubles: 2).
                        const takenByOther = !isActive && r.disabled;
                        const blocked = takenByOther && doubles; // doubles full → can't join
                        return (
                          <button
                            key={r.value}
                            type="button"
                            disabled={blocked}
                            onClick={() => handleToggleRank(r.value)}
                            aria-pressed={isActive}
                            title={
                              r.assignedTo
                                ? `${r.value} — ${r.assignedTo}${
                                    blocked
                                      ? ' (full)'
                                      : doubles
                                        ? ''
                                        : ' · assigning moves them out'
                                  }`
                                : r.value
                            }
                            className={[
                              'rounded-md border px-2 py-0.5 text-2xs font-mono font-medium tabular-nums',
                              'transition-colors duration-fast ease-brand disabled:cursor-not-allowed',
                              isActive
                                ? 'border-accent bg-accent/10 text-accent'
                                : blocked
                                  ? 'border-border/60 bg-muted/40 text-muted-foreground/50'
                                  : takenByOther
                                    ? 'border-status-warning/40 bg-status-warning-bg/40 text-status-warning'
                                    : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                            ].join(' ')}
                          >
                            {r.value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
