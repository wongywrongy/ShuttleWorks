/**
 * PlanCallList — the Plan board's queue-mode face (SP-COURT-1 CP4, ADR 0015).
 *
 * A court×time grid drawn from a queue solve is a fiction the day contradicts
 * within one match: the solver chose TIMES under a court-count capacity, and
 * the courts on the emitted assignments are colouring, not promises. So in
 * queue mode Plan shows what the solve actually decided — the ordered call
 * list — plus a feasibility band ("fits inside N courts, ends ~HH:MM").
 * The grid stays for pinned mode untouched.
 *
 * Order = ascending solved start, then the stable match key — the same rule
 * the engine's colouring sweep uses (`sort_key` in engine/court_pool.py), so
 * this list and the emitted courts never disagree about what comes next.
 */
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { OpsBlock } from '../opsBlock';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../../lib/selectableRow';
import { EYEBROW_CLASS } from '../../../lib/utils';
import { formatMatchIdentity } from '../../../platform/domain/matchIdentity';
import { STATE_WORD } from '../../../lib/stateWords';

// Shared match-state vocabulary (contract §2) — `started` reads as
// "On court" everywhere in the console; the literal 'Playing' this used to
// carry (D5) is deleted, not redirected to a second constant.
//
// `scheduled` is deliberately absent (P2): every row in a call list is
// scheduled, so a routine "Scheduled" stamp on each of them is noise. Only
// the states that differ from the lane's own meaning are named.
const PLAN_STATE_LABEL: Partial<Record<OpsBlock['status'], string>> = {
  called: STATE_WORD.called,
  started: STATE_WORD.onCourt,
  finished: STATE_WORD.done,
};

export interface PlanCallListProps {
  blocks: OpsBlock[];
  courtCount: number;
  /** Courts kept court-tied by per-court override. They are NOT part of the
   *  queue's capacity, so the feasibility band must exclude them. */
  pinnedCourts?: number[];
  selectedKey?: string | null;
  onSelect(key: string | null): void;
  formatSlot(slot: number): string;
}

export function PlanCallList({
  blocks,
  courtCount,
  pinnedCourts,
  selectedKey,
  onSelect,
  formatSlot,
}: PlanCallListProps) {
  const pinned = pinnedCourts ?? [];
  const poolCount = Math.max(0, courtCount - pinned.length);
  // Scheduled, not-done matches in call order. Unscheduled ones are not IN
  // the call list — the matches list below the board still shows them.
  const ordered = useMemo(
    () =>
      blocks
        .filter((b) => b.slot != null && !b.done)
        .sort(
          (a, b) =>
            (a.slot ?? 0) - (b.slot ?? 0) ||
            (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
        ),
    [blocks],
  );

  const endsAt = useMemo(() => {
    if (ordered.length === 0) return null;
    const last = Math.max(...ordered.map((b) => (b.slot ?? 0) + (b.span ?? 1)));
    // '' when the workspace has no configured clock — the band then makes no
    // claim about the finish rather than printing a slot index.
    return formatSlot(last) || null;
  }, [ordered, formatSlot]);

  if (ordered.length === 0) {
    return (
      <div
        data-testid="plan-call-list-empty"
        className="flex items-center justify-center px-4 py-10 text-sm text-muted-foreground"
      >
        No solved schedule yet. Generate one to see the call order.
      </div>
    );
  }

  return (
    <div data-testid="plan-call-list">
      {/* Feasibility band — the promise a queue solve actually makes. */}
      <div
        data-testid="plan-feasibility-band"
        className="flex items-center gap-3 border-b border-border bg-muted/20 px-4 py-2"
      >
        <span className={`${EYEBROW_CLASS} text-ink-3`}>Call order</span>
        <span className="text-xs text-muted-foreground">
          {ordered.length} matches across {poolCount} court{poolCount === 1 ? '' : 's'}
          {pinned.length > 0 ? (
            <> · {pinned.map((c) => `Court ${c}`).join(', ')} kept separate</>
          ) : null}
          {endsAt ? <> · ends ~{endsAt}</> : null}
        </span>
      </div>

      <ul className="divide-y divide-border/60">
        {ordered.map((b, i) => {
          const isSelected = selectedKey === b.key;
          return (
            <li
              key={b.key}
              data-testid={`plan-call-row-${b.key}`}
              data-source={b.source}
              style={{ '--i': i } as CSSProperties}
              className={`cursor-pointer px-4 py-1.5 hover:bg-muted/30 ${SELECTABLE_ROW_FOCUS} ${
                isSelected ? 'bg-muted/40' : ''
              }`}
              {...selectableRowProps(() => onSelect(b.key), isSelected)}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-6 flex-shrink-0 text-right text-2xs sw-num text-ink-faint">
                  #{i + 1}
                </span>
                <span className="w-16 flex-shrink-0 break-words text-2xs font-semibold sw-num text-ink-3">
                  {formatMatchIdentity(b.identity, b.id)}
                </span>
                {/* One side per line, no joiner — the shared match grammar
                    (§3.2); "vs" belongs to the inspector alone. */}
                <span className="min-w-[10rem] flex-1 break-words text-sm">
                  <span className="block">{b.sideA}</span>
                  <span className="block">{b.sideB}</span>
                </span>
                {/* Approximate start — honest tilde: queue mode promises the
                    ORDER; the clock time is the solve's estimate. */}
                {formatSlot(b.slot ?? 0) ? (
                  <span className="flex-shrink-0 text-2xs sw-num text-muted-foreground">
                    ~{formatSlot(b.slot ?? 0)}
                  </span>
                ) : null}
                {PLAN_STATE_LABEL[b.status] ? (
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {PLAN_STATE_LABEL[b.status]}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
