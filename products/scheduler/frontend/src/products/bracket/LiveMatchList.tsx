/**
 * LiveMatchList — the operator's working queue under the Live Gantt.
 *
 * Mirrors the meet Live tab's Up Next / Finished list: every match is
 * a dense row with status dot, id, court · time, player names, and
 * the action that moves it forward (Start, then "<name> wins"). The
 * Gantt chips above stay the spatial map; this list is where the
 * operator actually works — no pixel-hunting tiny chips.
 *
 * Sections:
 *   UP NEXT  — assigned to a court, not finished (sorted slot, court)
 *   WAITING  — sides known or pending, no court yet (schedule-next
 *              in the header is the move that promotes these)
 *   FINISHED — result recorded
 *
 * Recording a winner is irreversible in the bracket API (409 on
 * overwrite), so the win buttons confirm() first.
 */
import { useMemo } from 'react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { useBracketApi } from '../../api/bracketClient';
import { useUiStore } from '../../store/uiStore';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { formatBracketSlot } from './formatBracketSlot';
import { playUnitSideLabels } from './bracketLabels';

interface Props {
  data: BracketTournamentDTO;
  onChange: (t: BracketTournamentDTO) => void;
}

const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded-sm border border-border ` +
  `bg-card px-2 py-0.5 text-2xs font-medium text-card-foreground ` +
  `hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50`;

const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded-sm ` +
  `bg-primary px-2 py-0.5 text-2xs font-medium text-primary-foreground ` +
  `hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;

export function LiveMatchList({ data, onChange }: Props) {
  const api = useBracketApi();
  const selectedId = useUiStore((s) => s.bracketSelectedMatchId);
  const setSelectedId = useUiStore((s) => s.setBracketSelectedMatchId);
  const eventFilter = useUiStore((s) => s.bracketScheduleEventFilter);

  const nameById = useMemo(
    () => Object.fromEntries(data.participants.map((p) => [p.id, p.name])),
    [data.participants],
  );
  const assignmentByPu = useMemo(
    () => new Map(data.assignments.map((a) => [a.play_unit_id, a])),
    [data.assignments],
  );
  const resultByPu = useMemo(
    () => new Map(data.results.map((r) => [r.play_unit_id, r])),
    [data.results],
  );

  const { upNext, waiting, finished } = useMemo(() => {
    // Default-on semantics: a missing filter key means the event is on.
    const visible = data.play_units.filter(
      (pu) => eventFilter[pu.event_id] !== false,
    );
    const upNext = visible
      .filter((pu) => assignmentByPu.has(pu.id) && !resultByPu.has(pu.id))
      .sort((x, y) => {
        const a = assignmentByPu.get(x.id)!;
        const b = assignmentByPu.get(y.id)!;
        return a.slot_id - b.slot_id || a.court_id - b.court_id;
      });
    const waiting = visible.filter(
      (pu) => !assignmentByPu.has(pu.id) && !resultByPu.has(pu.id),
    );
    const finished = visible.filter((pu) => resultByPu.has(pu.id));
    return { upNext, waiting, finished };
  }, [data.play_units, eventFilter, assignmentByPu, resultByPu]);

  const slotCtx = {
    start_time: data.start_time,
    interval_minutes: data.interval_minutes,
  };

  const recordWinner = async (puId: string, side: 'A' | 'B', name: string) => {
    if (!window.confirm(`Record ${name} as the winner of ${puId}? This cannot be undone.`)) {
      return;
    }
    const a = assignmentByPu.get(puId);
    onChange(
      await api.recordResult({
        play_unit_id: puId,
        winner_side: side,
        finished_at_slot: a ? a.actual_end_slot ?? a.slot_id + a.duration_slots : null,
      }),
    );
  };

  const renderRow = (puId: string) => {
    const pu = data.play_units.find((p) => p.id === puId);
    if (!pu) return null;
    const assignment = assignmentByPu.get(pu.id);
    const result = resultByPu.get(pu.id);
    const { a: labelA, b: labelB } = playUnitSideLabels(pu, nameById);
    const started = assignment?.actual_start_slot != null;
    const sidesReady = pu.side_a != null && pu.side_b != null;

    const dotClass = result
      ? 'bg-status-done'
      : started
        ? 'bg-status-live'
        : assignment
          ? 'bg-status-called'
          : 'bg-muted-foreground/40';

    return (
      <li
        key={pu.id}
        className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 hover:bg-muted/30 ${
          selectedId === pu.id ? 'bg-muted/40' : ''
        }`}
        onClick={() => setSelectedId(pu.id)}
      >
        <span aria-hidden="true" className={`h-2 w-2 flex-shrink-0 rounded-full ${dotClass}`} />
        <span className="w-20 flex-shrink-0 font-mono text-2xs tracking-wider text-foreground">
          {pu.id}
        </span>
        <span className="w-24 flex-shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
          {assignment
            ? `C${assignment.court_id} · ${formatBracketSlot(assignment.slot_id, slotCtx)}`
            : '—'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className={result?.winner_side === 'A' ? 'font-semibold' : ''}>{labelA}</span>
          <span className="px-1.5 text-2xs uppercase tracking-wider text-muted-foreground">vs</span>
          <span className={result?.winner_side === 'B' ? 'font-semibold' : ''}>{labelB}</span>
        </span>
        <span
          className="flex flex-shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {result ? (
            <span className="text-2xs font-semibold uppercase tracking-wider text-status-done">
              {result.winner_side === 'A' ? labelA : labelB} won
            </span>
          ) : assignment && !started ? (
            <button
              type="button"
              className={primaryBtn}
              onClick={async () => {
                onChange(await api.matchAction({ play_unit_id: pu.id, action: 'start' }));
              }}
            >
              Start
            </button>
          ) : assignment && started ? (
            <>
              <button
                type="button"
                className={actionBtn}
                title={`${labelA} wins`}
                onClick={() => void recordWinner(pu.id, 'A', labelA)}
              >
                {labelA} wins
              </button>
              <button
                type="button"
                className={actionBtn}
                title={`${labelB} wins`}
                onClick={() => void recordWinner(pu.id, 'B', labelB)}
              >
                {labelB} wins
              </button>
            </>
          ) : (
            <span className="text-2xs text-muted-foreground">
              {sidesReady ? 'awaiting court' : 'awaiting winners'}
            </span>
          )}
        </span>
      </li>
    );
  };

  const section = (title: string, ids: string[]) =>
    ids.length > 0 ? (
      <>
        <li className="border-y border-border bg-muted/40 px-4 py-1 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title} · {ids.length}
        </li>
        {ids.map(renderRow)}
      </>
    ) : null;

  return (
    <ul className="divide-y divide-border/60 border-t border-border">
      {section('Up next', upNext.map((p) => p.id))}
      {section('Waiting', waiting.map((p) => p.id))}
      {section('Finished', finished.map((p) => p.id))}
    </ul>
  );
}
