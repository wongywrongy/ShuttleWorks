/**
 * Position detail — a floating drawer that opens over the right edge of
 * the position grid when a filled cell is clicked. It is a *position*
 * view, not a single-player view: a doubles cell shows both partners
 * (singles shows the one occupant), each as an editable PlayerDetailFields
 * block. The grid stays full-width behind it (the drawer is a layer on
 * top, dismissed by Esc, the × button, or clicking outside) so the detail
 * is readable instead of squeezed into a narrow side pane.
 *
 * All fields are per-player (school, availability, rest, notes, ranks) —
 * there is no separate position-level data — so the drawer simply renders
 * one block per occupant. Edits flow through `updatePlayer`.
 */
import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { Select } from '@scheduler/design-system/components';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useRankAssignment } from './positionGrid/useRankAssignment';
import { useRankValidation } from './hooks/useRankValidation';
import { isDoublesRank } from './positionGrid/helpers';

/* =========================================================================
 * DetailDrawer — the floating overlay. Renders one editable block per
 * occupant under a header. Used for a clicked position (a rank's 1–2
 * occupants) and for a clicked list player (a single occupant).
 * ========================================================================= */
export function DetailDrawer({
  eyebrow,
  title,
  subtitle,
  mono = false,
  occupants,
  groups,
  emptyHint,
  onClose,
}: {
  /** Uppercase context label, e.g. "Position" or "Player". */
  eyebrow: string;
  /** Primary heading — a rank ("MS1") or a player name. */
  title: string;
  /** Optional muted context after the title (e.g. the event label). */
  subtitle?: string;
  /** Render the title in the mono face (true for rank codes). */
  mono?: boolean;
  occupants: PlayerDTO[];
  groups: RosterGroupDTO[];
  /** Shown below the occupants when the position has open seats. */
  emptyHint?: string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Focus the drawer on open so Esc + screen readers land here.
  useEffect(() => {
    ref.current?.focus();
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="position-detail-drawer"
      role="dialog"
      aria-label={`${eyebrow} ${title}`}
      tabIndex={-1}
      className="absolute inset-y-0 right-0 z-overlay flex w-[380px] max-w-[90%] flex-col border-l border-border bg-card text-foreground shadow-2xl outline-none animate-block-in"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </span>
          <span
            className={[
              'text-sm font-semibold text-foreground',
              mono ? 'font-mono' : '',
            ].join(' ')}
          >
            {title}
          </span>
          {subtitle ? (
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted/60 hover:text-foreground"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {occupants.map((occ) => (
          <PlayerDetailFields key={occ.id} player={occ} groups={groups} />
        ))}
        {emptyHint ? (
          <p className="border-t border-border/60 px-3 py-3 text-xs italic text-muted-foreground">
            {emptyHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* =========================================================================
 * PlayerDetailFields — one occupant's editable block (school, availability,
 * min rest, notes, rank pills). Rendered once per occupant in the drawer.
 * ========================================================================= */
function PlayerDetailFields({
  player,
  groups,
}: {
  player: PlayerDTO;
  groups: RosterGroupDTO[];
}) {
  const updatePlayer = useTournamentStore((s) => s.updatePlayer);
  const { assignRank, unassignRank } = useRankAssignment();
  const { availableRanks, isRankFull } = useRankValidation(
    player.groupId ?? null,
    player.id,
  );

  const handleToggleRank = (rank: string) => {
    if ((player.ranks ?? []).includes(rank)) {
      unassignRank(player.id, rank);
      return;
    }
    if (isDoublesRank(rank) && isRankFull(rank)) return;
    assignRank(player.groupId, player.id, rank);
  };

  return (
    <div className="border-b border-border/60 px-3 py-3 last:border-b-0">
      <div className="mb-2 text-sm font-semibold text-foreground">
        {player.name || '(unnamed)'}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">School</label>
          <Select
            value={player.groupId}
            onValueChange={(v) => updatePlayer(player.id, { groupId: v })}
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
            htmlFor={`player-rest-${player.id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Min rest
          </label>
          <span className="inline-flex items-baseline gap-2">
            <input
              id={`player-rest-${player.id}`}
              type="number"
              min={0}
              max={120}
              value={player.minRestMinutes != null ? String(player.minRestMinutes) : ''}
              placeholder="default"
              onChange={(e) => {
                const raw = e.target.value;
                updatePlayer(player.id, {
                  minRestMinutes: raw === '' ? undefined : Number(raw) || 0,
                });
              }}
              className="h-7 w-20 rounded-sm border border-border bg-bg-elev px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`player-notes-${player.id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Notes
          </label>
          <textarea
            id={`player-notes-${player.id}`}
            value={player.notes ?? ''}
            onChange={(e) =>
              updatePlayer(player.id, { notes: e.target.value || undefined })
            }
            rows={3}
            placeholder="Optional notes…"
            className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Ranks</label>
          {Object.keys(availableRanks).length === 0 ? (
            <span className="text-xs text-muted-foreground">
              Configure positions in Configuration to assign ranks.
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
                    const takenByOther = !isActive && r.disabled;
                    const blocked = takenByOther && doubles;
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
  );
}
