/**
 * PlayerDetailPanel — docks to the bottom of the Roster right panel
 * when a player is selected. Slides up from below via CSS transform
 * and overlays the bottom 280 px of the grid area; the grid itself
 * keeps its full scrollable height (the operator scrolls past the
 * panel rather than the panel taking grid space).
 *
 * Always mounted so the slide animation runs both directions cleanly;
 * `pointer-events-none` + opacity 0 + translate-y-full make it inert
 * when no player is selected.
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
import { useMemo } from 'react';
import { X } from '@phosphor-icons/react';
import type { PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../api/dto';
import { useAppStore } from '../../store/appStore';
import { isDoublesRank } from './positionGrid/helpers';

interface Props {
  player: PlayerDTO | null;
  visible: boolean;
  onDismiss: () => void;
  groups: RosterGroupDTO[];
  config: TournamentConfig | null;
}

export function PlayerDetailPanel({
  player,
  visible,
  onDismiss,
  groups,
  config,
}: Props) {
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  // Need the full player list to enforce the singles invariant on
  // toggle (displace any other player in the same school who already
  // holds the rank). PositionCell's `assignPlayer` already does this;
  // PlayerDetailPanel must mirror it so the rank-pill toggle can't
  // create the same duplicate state PositionCell prevents.
  const allPlayers = useAppStore((s) => s.players);

  // Available ranks derived from config.rankCounts. Per BRAND.md events
  // are 5 disciplines (MS / WS / MD / WD / XD), each with N positions.
  const availableRanks = useMemo(() => {
    if (!config?.rankCounts) return [] as string[];
    const ranks: string[] = [];
    for (const [prefix, count] of Object.entries(config.rankCounts)) {
      for (let i = 1; i <= (count ?? 0); i++) ranks.push(`${prefix}${i}`);
    }
    return ranks;
  }, [config?.rankCounts]);

  const handleToggleRank = (rank: string) => {
    if (!player) return;
    const isActive = (player.ranks ?? []).includes(rank);
    if (isActive) {
      // Removal: always safe.
      updatePlayer(player.id, {
        ranks: (player.ranks ?? []).filter((r) => r !== rank),
      });
      return;
    }
    // Addition: if singles, displace every other player in this school
    // that already holds the rank — invariant: ≤1 player per (school,
    // singles rank). Doubles allow 2 partners; let the toggle act
    // freely and rely on PositionCell's capacity guard.
    if (!isDoublesRank(rank)) {
      for (const other of allPlayers) {
        if (
          other.id !== player.id &&
          other.groupId === player.groupId &&
          (other.ranks ?? []).includes(rank)
        ) {
          updatePlayer(other.id, {
            ranks: (other.ranks ?? []).filter((r) => r !== rank),
          });
        }
      }
    }
    updatePlayer(player.id, { ranks: [...(player.ranks ?? []), rank] });
  };

  return (
    <div
      data-testid="player-detail-panel"
      aria-hidden={!visible}
      className={[
        'absolute inset-x-0 bottom-0 z-overlay flex h-[280px] shrink-0 flex-col border-t border-border bg-card text-foreground',
        'transition-[transform,opacity] duration-moderate ease-brand',
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-full opacity-0',
      ].join(' ')}
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
          {/* Two-column layout matches the rest of the Setup-style
              rows: label left at 13px / fixed width, control right. */}
          <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 items-center">
            <label className="text-xs font-medium text-muted-foreground">School</label>
            <select
              value={player.groupId}
              onChange={(e) =>
                updatePlayer(player.id, { groupId: e.target.value })
              }
              className="h-7 w-[220px] rounded-sm border border-border bg-bg-elev px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <label className="text-xs font-medium text-muted-foreground">Availability</label>
            <span className="text-xs text-muted-foreground">
              {player.availability && player.availability.length > 0
                ? `${player.availability.length} window${player.availability.length === 1 ? '' : 's'} defined`
                : 'All day (no restrictions)'}
            </span>

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

            <label
              htmlFor="player-notes-input"
              className="text-xs font-medium text-muted-foreground self-start mt-1"
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
              rows={2}
              placeholder="Optional notes…"
              className="w-[360px] rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <label className="text-xs font-medium text-muted-foreground self-start mt-1">
              Ranks
            </label>
            <div className="flex flex-wrap gap-1.5">
              {availableRanks.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Configure positions in Setup to assign ranks.
                </span>
              ) : (
                availableRanks.map((r) => {
                  const isActive = (player.ranks ?? []).includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleToggleRank(r)}
                      aria-pressed={isActive}
                      className={[
                        'rounded-[6px] border px-2 py-0.5 text-2xs font-mono font-medium tabular-nums',
                        'transition-colors duration-fast ease-brand',
                        isActive
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                      ].join(' ')}
                    >
                      {r}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
