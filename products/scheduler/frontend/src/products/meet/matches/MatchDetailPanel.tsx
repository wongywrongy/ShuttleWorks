/**
 * Match detail panel — the right-docked drawer a clicked match row opens
 * (SP-D7 S4). Header reads `[MATCH] MD1 · Men's Doubles`; the body lists
 * each side's players as collapsed cards that expand IN PLACE to the same
 * Availability / Events field blocks the roster panel renders
 * (`PlayerAvailabilityField` / `PlayerEventsField` — one implementation,
 * writing through the CANONICAL roster record via `updatePlayer`, never a
 * match-scoped copy).
 *
 * No Slots field: a match takes exactly ONE slot — duration is not a
 * per-match knob (product rule, 2026-07-02).
 */
import { useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import {
  DetailPanel,
  STATUS_CLASS,
  STATUS_LABEL,
  type MatchListStatus,
} from '../../../components/control-plane';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { MatchDTO, PlayerDTO, RosterGroupDTO } from '../../../api/dto';
import {
  PlayerAvailabilityField,
  PlayerEventsField,
} from '../roster/PlayerDetailPanel';
import { EVENT_LABEL } from '../roster/positionGrid/helpers';

const FIELD_LABEL_CLASSES =
  'text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground';

export function MatchDetailPanel({
  match,
  status,
  onClose,
}: {
  match: MatchDTO;
  status?: MatchListStatus;
  onClose: () => void;
}) {
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);

  const code = match.eventRank?.trim() ?? '';
  const prefix = code.match(/^[A-Z]+/)?.[0] ?? '';

  return (
    <DetailPanel
      label="Match"
      value={code || '—'}
      sub={EVENT_LABEL[prefix]?.full}
      mono
      onClose={onClose}
      testId="match-detail-panel"
    >
      <div className="flex flex-col gap-3 px-3 py-3">
        <SideSection
          label="Side A"
          ids={match.sideA ?? []}
          players={players}
          groups={groups}
        />
        <SideSection
          label="Side B"
          ids={match.sideB ?? []}
          players={players}
          groups={groups}
        />
        {status ? (
          <div className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASSES}>Status</span>
            {/* Read-only pill — Operations owns run-state; never interactive. */}
            <span
              data-testid="match-status-pill"
              className={`inline-flex w-fit items-center rounded-sm border border-border bg-card px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${STATUS_CLASS[status]}`}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
        ) : null}
      </div>
    </DetailPanel>
  );
}

/* =========================================================================
 * SideSection — one side's player cards. Collapsed: name + school badge.
 * Expanded (click; several may be open at once): the shared roster
 * Availability + Events blocks. An empty side renders the dashed
 * non-interactive placeholder.
 * ========================================================================= */
function SideSection({
  label,
  ids,
  players,
  groups,
}: {
  label: string;
  ids: string[];
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASSES}>{label}</span>
      {ids.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
          No players assigned
        </div>
      ) : (
        ids.map((id) => {
          const player = players.find((p) => p.id === id);
          if (!player) {
            // Stale reference (player deleted from the roster) — surface
            // it instead of silently dropping the slot; nothing to edit.
            return (
              <div
                key={id}
                className="rounded-sm border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
              >
                <span className="italic">{id}</span>
                <span className="ml-1.5 text-2xs text-muted-foreground">
                  Not on roster
                </span>
              </div>
            );
          }
          const school = groups.find((g) => g.id === player.groupId)?.name ?? '';
          const open = openIds.has(id);
          return (
            <div
              key={id}
              className="overflow-hidden rounded-sm border border-border"
            >
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-expanded={open}
                data-testid={`match-player-card-${id}`}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors duration-fast ease-brand hover:bg-muted/40"
              >
                <CaretRight
                  aria-hidden
                  weight="bold"
                  className={[
                    'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
                    open ? 'rotate-90' : '',
                  ].join(' ')}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {player.name || '(unnamed)'}
                </span>
                {school ? (
                  <span className="shrink-0 rounded-sm border border-border bg-muted/40 px-1 py-px text-3xs text-muted-foreground">
                    {school}
                  </span>
                ) : null}
              </button>
              {open ? (
                <div className="flex flex-col gap-3 border-t border-border/60 px-2 py-2">
                  <PlayerAvailabilityField player={player} />
                  <PlayerEventsField player={player} />
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}

