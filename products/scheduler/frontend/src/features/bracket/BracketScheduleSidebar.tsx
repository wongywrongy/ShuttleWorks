/**
 * Right-rail details pane for the bracket Schedule. Keyed off
 * `selectedId`. Read-only by design — no Director, Re-plan, or Move/
 * Postpone affordances (those are meet-only solver actions).
 */
import { useMemo } from 'react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { formatBracketSlot } from './formatBracketSlot';

interface Props {
  data: BracketTournamentDTO;
  selectedId: string | null;
}

export function BracketScheduleSidebar({ data, selectedId }: Props) {
  const pu = useMemo(
    () => (selectedId ? data.play_units.find((p) => p.id === selectedId) : undefined),
    [data.play_units, selectedId],
  );
  const assignment = useMemo(
    () => (selectedId ? data.assignments.find((a) => a.play_unit_id === selectedId) : undefined),
    [data.assignments, selectedId],
  );
  const event = useMemo(
    () => (pu ? data.events.find((e) => e.id === pu.event_id) : undefined),
    [data.events, pu],
  );
  const result = useMemo(
    () => (selectedId ? data.results.find((r) => r.play_unit_id === selectedId) : undefined),
    [data.results, selectedId],
  );
  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );

  if (!pu || !assignment) {
    return (
      <aside className="w-64 shrink-0 border-l border-border bg-background px-4 py-6 text-sm text-muted-foreground">
        Click a match to see details.
      </aside>
    );
  }

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
  };

  const time = formatBracketSlot(assignment.slot_id, {
    start_time: data.start_time,
    interval_minutes: data.interval_minutes,
  });

  const state = result
    ? 'done'
    : assignment.started
      ? 'live'
      : 'ready';
  const stateClasses =
    state === 'done'
      ? 'bg-status-done/15 text-status-done'
      : state === 'live'
        ? 'bg-status-live/15 text-status-live'
        : 'bg-muted text-muted-foreground';

  return (
    <aside className="w-64 shrink-0 overflow-auto border-l border-border bg-background px-4 py-4">
      <div className="mb-3">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {event?.discipline ?? '—'}
        </div>
        <div className="text-sm font-medium text-foreground">
          R{pu.round_index + 1} M{pu.match_index + 1}
        </div>
        <div className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
          C{assignment.court_id} · {time}
        </div>
      </div>
      <div className="space-y-1 border-t border-border pt-3 text-2xs">
        <div>
          <span className="text-muted-foreground">Side A:</span>{' '}
          <span className="text-foreground">{resolveSide(pu.side_a)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Side B:</span>{' '}
          <span className="text-foreground">{resolveSide(pu.side_b)}</span>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-3 text-2xs">
        <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 font-medium capitalize ${stateClasses}`}>
          {state}
        </span>
        {result ? (
          <div className="mt-1 text-foreground">
            Winner: Side {result.winner_side}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
