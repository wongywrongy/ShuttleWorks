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
import { MODULE_LABELS } from '../../../platform/product-shell/types';
import { formatMatchIdentity } from '../../../platform/domain/matchIdentity';

const SOURCE_LABEL: Record<'meet' | 'bracket', string> = {
  meet: MODULE_LABELS.meet,
  bracket: MODULE_LABELS.bracket,
};
const SOURCE_SQUARE: Record<'meet' | 'bracket', string> = {
  meet: 'bg-module-meet/15 text-module-meet',
  bracket: 'bg-module-bracket/15 text-module-bracket',
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
    return formatSlot(last);
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
                <span
                  aria-hidden
                  title={SOURCE_LABEL[b.source]}
                  className={`inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-xs text-[9px] font-semibold sw-num ${SOURCE_SQUARE[b.source]}`}
                >
                  {SOURCE_LABEL[b.source][0]}
                </span>
                <span className="w-16 flex-shrink-0 break-words text-2xs font-semibold sw-num text-ink-3">
                  {formatMatchIdentity(b.identity, b.id)}
                </span>
                <span className="min-w-[10rem] flex-1 break-words text-sm">
                  {b.sideA}
                  <span className="px-1.5 text-2xs uppercase tracking-[0.08em] text-muted-foreground">
                    v
                  </span>
                  {b.sideB}
                </span>
                {/* Approximate start — honest tilde: queue mode promises the
                    ORDER; the clock time is the solve's estimate. */}
                <span className="flex-shrink-0 text-2xs sw-num text-muted-foreground">
                  ~{formatSlot(b.slot ?? 0)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
