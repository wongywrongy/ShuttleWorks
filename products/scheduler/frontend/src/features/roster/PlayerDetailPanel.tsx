/**
 * PlayerDetailPanel — permanent footer rail of the Roster right
 * panel. Always docked at the bottom of the page as a flex sibling
 * of the grid; renders an empty-state hint when no player is
 * selected, and an editable form when one is.
 *
 * Shows the same fields the (now-removed) inline RosterSpreadsheet
 * carried for one player: school, availability summary, min rest, notes,
 * ranks as toggleable pills. All edits flow through `updatePlayer` on
 * the app store.
 *
 * The × close button clears the current selection back to the empty
 * state — it does NOT hide the panel.
 */
import { useMemo } from 'react';
import { X } from '@phosphor-icons/react';
import type { PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../api/dto';
import { useAppStore } from '../../store/appStore';

interface Props {
  player: PlayerDTO | null;
  onDismiss: () => void;
  groups: RosterGroupDTO[];
  config: TournamentConfig | null;
}

export function PlayerDetailPanel({
  player,
  onDismiss,
  groups,
  config,
}: Props) {
  const updatePlayer = useAppStore((s) => s.updatePlayer);

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

  return (
    <div
      data-testid="player-detail-panel"
      className="shrink-0 border-t border-border bg-card text-foreground"
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
          ) : (
            <span className="text-xs text-muted-foreground">
              No player selected
            </span>
          )}
        </div>
        {player ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Clear player selection"
            className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted/60 hover:text-foreground"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {player ? (
        <div className="max-h-[40vh] overflow-y-auto px-3 py-3">
          {/* Two-column layout matches the rest of the Setup-style
              rows: label left at 13px / fixed width, control right. */}
          <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 items-center">
            <label className="text-[12px] font-medium text-muted-foreground">School</label>
            <select
              value={player.groupId}
              onChange={(e) =>
                updatePlayer(player.id, { groupId: e.target.value })
              }
              className="h-7 rounded-sm border border-border bg-bg-elev px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ width: 220 }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <label className="text-[12px] font-medium text-muted-foreground">Availability</label>
            <span className="text-xs text-muted-foreground">
              {player.availability && player.availability.length > 0
                ? `${player.availability.length} window${player.availability.length === 1 ? '' : 's'} defined`
                : 'All day (no restrictions)'}
            </span>

            <label
              htmlFor="player-rest-input"
              className="text-[12px] font-medium text-muted-foreground"
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
              className="text-[12px] font-medium text-muted-foreground self-start mt-1"
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
              className="rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ width: 360 }}
            />

            <label className="text-[12px] font-medium text-muted-foreground self-start mt-1">
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
                      onClick={() => {
                        const current = player.ranks ?? [];
                        updatePlayer(player.id, {
                          ranks: isActive
                            ? current.filter((x) => x !== r)
                            : [...current, r],
                        });
                      }}
                      aria-pressed={isActive}
                      className={[
                        'rounded-[6px] border px-2 py-0.5 text-[11px] font-mono font-medium tabular-nums',
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
      ) : (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          Select a player from the list on the left to edit their school,
          availability, rest minimum, notes, and rank assignments.
        </div>
      )}
    </div>
  );
}
