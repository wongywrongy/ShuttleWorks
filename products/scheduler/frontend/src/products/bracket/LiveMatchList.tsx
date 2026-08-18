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
 *   PENDING  — sides known or not yet decided, no court yet (schedule-next
 *              in the header is the move that promotes these)
 *   FINISHED — result recorded
 *
 * Recording a winner is irreversible in the bracket API (409 on overwrite), so
 * the win buttons arm on the first press and commit on the second
 * (`WinnerButton`) — no native dialog.
 */
import { useMemo } from 'react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { useBracketApi } from '../../api/bracketClient';
import { useUiStore } from '../../store/uiStore';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../lib/selectableRow';
import { STATE_WORD } from '../../lib/stateWords';
import { formatBracketSlot } from './formatBracketSlot';
import { playUnitSideLabels } from './bracketLabels';
import { WinnerButton } from './WinnerButton';

interface Props {
  data: BracketTournamentDTO;
  onChange: (t: BracketTournamentDTO) => void;
}

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

  // The `window.confirm` that used to guard this is gone — the canon two-click
  // arm lives in `WinnerButton` (audit E1). A native dialog blocks the event
  // loop and is banned by the design canon.
  const recordWinner = async (puId: string, side: 'A' | 'B') => {
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
          : 'bg-muted-foreground';

    return (
      <li
        key={pu.id}
        className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 hover:bg-muted/30 ${SELECTABLE_ROW_FOCUS} ${
          selectedId === pu.id ? 'bg-muted/40' : ''
        }`}
        {...selectableRowProps(() => setSelectedId(pu.id), selectedId === pu.id)}
      >
        <span aria-hidden="true" className={`h-2 w-2 flex-shrink-0 rounded-full ${dotClass}`} />
        <span className="w-20 flex-shrink-0 sw-num text-2xs text-foreground">
          {pu.id}
        </span>
        <span className="w-24 flex-shrink-0 sw-num text-2xs text-muted-foreground">
          {assignment
            ? `C${assignment.court_id} · ${formatBracketSlot(assignment.slot_id, slotCtx)}`
            : '–'}
        </span>
        <span className="min-w-0 flex-1 break-words text-sm">
          <span className={result?.winner_side === 'A' ? 'font-semibold' : ''}>{labelA}</span>
          <span className="px-1.5 text-2xs uppercase tracking-[0.08em] text-muted-foreground">vs</span>
          <span className={result?.winner_side === 'B' ? 'font-semibold' : ''}>{labelB}</span>
        </span>
        <span
          className="flex flex-shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {result ? (
            <span className={`${EYEBROW_CLASS} text-status-done`}>
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
              <WinnerButton
                label={labelA}
                onConfirm={() => void recordWinner(pu.id, 'A')}
                testId={`live-win-a-${pu.id}`}
              />
              <WinnerButton
                label={labelB}
                onConfirm={() => void recordWinner(pu.id, 'B')}
                testId={`live-win-b-${pu.id}`}
              />
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
        <li className={`border-y border-border bg-muted/40 px-4 py-1 ${EYEBROW_CLASS} text-muted-foreground`}>
          {title} · {ids.length}
        </li>
        {ids.map(renderRow)}
      </>
    ) : null;

  return (
    <ul className="divide-y divide-border/60 border-t border-border">
      {section('Up next', upNext.map((p) => p.id))}
      {section(STATE_WORD.pending, waiting.map((p) => p.id))}
      {section('Finished', finished.map((p) => p.id))}
    </ul>
  );
}
