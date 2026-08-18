/**
 * MatchCard — the shared BWF-style match-presentation atom (SP-CONSOLE-REFINE
 * G6). One anatomy reused everywhere a match is shown as a card: sides
 * stacked vertically, a winner marker on the winning side, set scores as
 * right-aligned COLUMN LANES (fixed-width per set, so set numbers align
 * vertically across every card on the page), inline RET/W.O. badges next to
 * the affected side, and an optional footer meta strip (round · event ·
 * court · time).
 *
 * List rows stay table rows; they adopt the same score lane via `ScoreLane`
 * in their Status cell (scores + winner dot = done, so the DONE pill retires
 * where a score can say it).
 *
 * Presentation-only: both engines' set shapes are `{sideA, sideB}` (ADR 0006
 * keeps the score JSON shared), so this file needs no per-engine adapter.
 */
import type { ReactNode } from 'react';

export interface SetPair {
  sideA: number;
  sideB: number;
}

/** Contingency annotation → the tiny badge next to the affected side. */
export type MatchReason = 'walkover' | 'retired' | 'forfeit';

export const REASON_BADGE: Record<MatchReason, string> = {
  walkover: 'W.O.',
  retired: 'Ret.',
  forfeit: 'FF',
};

/** Which side a completed set list says won — null while it says nothing
 *  (no sets, or a tie, which real data should not produce). */
export function setsWinner(sets: SetPair[] | undefined | null): 'A' | 'B' | null {
  if (!sets || sets.length === 0) return null;
  let a = 0;
  let b = 0;
  for (const s of sets) {
    if (s.sideA > s.sideB) a += 1;
    else if (s.sideB > s.sideA) b += 1;
  }
  return a === b ? null : a > b ? 'A' : 'B';
}

/** The winner marker — a small filled dot, the BWF/tournamentsoftware cue. */
export function WinnerDot({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="winner"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-status-success-fg ${className}`}
    />
  );
}

/** Per-set fixed column width — the lane's alignment guarantee. `w-9` holds
 *  "21-19" (5ch tabular at 12px) with a breath of air either side. */
const SET_COL = 'w-9 text-right';

/**
 * ScoreLane — the compact one-line lane for LIST ROWS' status cells:
 * each set a fixed-width right-aligned "a-b" pair, so pairs align
 * vertically down the list. Optional reason badge leads the lane.
 */
export function ScoreLane({
  sets,
  reason,
  'data-testid': testId,
}: {
  sets: SetPair[];
  reason?: MatchReason | null;
  'data-testid'?: string;
}) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center justify-end gap-0.5 text-xs tabular-nums text-foreground"
    >
      {reason ? (
        <span className="mr-1 rounded-sm bg-muted px-1 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
          {REASON_BADGE[reason]}
        </span>
      ) : null}
      {sets.map((s, i) => (
        <span key={i} className={`${SET_COL} inline-block`}>
          {s.sideA}-{s.sideB}
        </span>
      ))}
    </span>
  );
}

/** One stacked side inside a MatchCard: chip slot · names · winner dot ·
 *  that side's set-score cells. */
function CardSide({
  side,
  names,
  chip,
  won,
  sets,
  reason,
}: {
  side: 'A' | 'B';
  names: ReactNode;
  chip?: ReactNode;
  won: boolean;
  sets: SetPair[];
  reason?: MatchReason | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 py-0.5" data-side={side}>
      {chip ? <span className="shrink-0">{chip}</span> : null}
      <span
        className={[
          'min-w-0 flex-1 break-words text-2sm leading-snug',
          won ? 'font-semibold text-foreground' : 'text-foreground',
        ].join(' ')}
      >
        {names}
        {reason ? (
          <span className="ml-1.5 rounded-sm bg-muted px-1 align-middle text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
            {REASON_BADGE[reason]}
          </span>
        ) : null}
      </span>
      <span className="w-3 shrink-0 text-center">{won ? <WinnerDot /> : null}</span>
      {sets.length > 0 ? (
        <span className="flex shrink-0 items-center text-2sm tabular-nums">
          {sets.map((s, i) => {
            const mine = side === 'A' ? s.sideA : s.sideB;
            const theirs = side === 'A' ? s.sideB : s.sideA;
            return (
              <span
                key={i}
                className={[
                  SET_COL,
                  'inline-block',
                  mine > theirs ? 'font-semibold text-foreground' : 'text-muted-foreground',
                ].join(' ')}
              >
                {mine}
              </span>
            );
          })}
        </span>
      ) : null}
    </div>
  );
}

/**
 * MatchCard — the stacked-side card. Contexts: detail panes, draw-tree
 * nodes, court cards. Sides render one per line; the set-score columns are
 * the right-aligned lane; the optional `meta` strip renders beneath a
 * hairline ("QF · MD · Court 4 · 10:30" — the caller composes the string).
 */
/** One side of a ResultSides block (RES-1): the caller's stack of
 *  interactive player rows beside the side RAIL — the side's identity
 *  chip (once per side, never per player row), the contingency badge,
 *  and the side's score in the fixed-width tabular slot. The rail is
 *  vertically centered against the block, and the slot holds a games
 *  tally ("2") or set scores ("21 21") without layout change: both are
 *  `SetPair[]`, one `SET_COL` column per pair. Winner reads by WEIGHT
 *  (bolder score here, bolder names in the caller's rows) — no dot, no
 *  fill; `WinnerDot` stays a list/card cue (MAT-3/BMAT-2 stand). */
function ResultSideBlock({
  side,
  rows,
  rail,
  won,
  sets,
  reason,
}: {
  side: 'A' | 'B';
  rows: ReactNode;
  /** Side-level identity — Meet school chip, Bracket event badge. */
  rail?: ReactNode;
  won: boolean;
  sets: SetPair[];
  reason?: MatchReason | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 py-1.5" data-side={side}>
      <div className="min-w-0 flex-1">{rows}</div>
      {rail ? <span className="shrink-0">{rail}</span> : null}
      {reason ? (
        <span className="shrink-0 rounded-sm bg-muted px-1 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
          {REASON_BADGE[reason]}
        </span>
      ) : null}
      {sets.length > 0 ? (
        <span
          data-testid={`result-score-${side}`}
          className={[
            'flex shrink-0 items-center text-2sm tabular-nums',
            won ? 'font-semibold text-foreground' : 'text-muted-foreground',
          ].join(' ')}
        >
          {sets.map((s, i) => (
            <span key={i} className={`${SET_COL} inline-block`}>
              {side === 'A' ? s.sideA : s.sideB}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/**
 * ResultSides — the FINISHED match's sole roster surface in the detail
 * panels (INS-N1), rendered as TWO SIDE BLOCKS (RES-1): score is a
 * per-side fact, so each block owns a rail (identity chip once per side +
 * the side's score, vertically centered) with the caller's INTERACTIVE
 * player rows (per-player expand) nested inside. A hairline separates the
 * blocks so they read as two units; the court · time caption stays below.
 * Winner reads by weight — bolder score here, bolder names via the
 * caller's rows — never a dot or a fill.
 */
export function ResultSides({
  sideA,
  sideB,
  railA,
  railB,
  sets = [],
  winner = null,
  reasonSide = null,
  reason = null,
  meta,
  'data-testid': testId,
}: {
  sideA: ReactNode;
  sideB: ReactNode;
  /** Per-side identity for the rail — Meet school chip, Bracket event
   *  badge (BMAT-3 anatomy). Per-player identity stays inside the
   *  caller's EXPANDED rows, not repeated on every collapsed row. */
  railA?: ReactNode;
  railB?: ReactNode;
  sets?: SetPair[];
  winner?: 'A' | 'B' | null;
  reasonSide?: 'A' | 'B' | null;
  reason?: MatchReason | null;
  meta?: ReactNode;
  'data-testid'?: string;
}) {
  const won = winner ?? setsWinner(sets);
  return (
    <div data-testid={testId} className="min-w-0">
      <div className="flex flex-col divide-y divide-border/60">
        <ResultSideBlock
          side="A"
          rows={sideA}
          rail={railA}
          won={won === 'A'}
          sets={sets}
          reason={reasonSide === 'A' ? reason : null}
        />
        <ResultSideBlock
          side="B"
          rows={sideB}
          rail={railB}
          won={won === 'B'}
          sets={sets}
          reason={reasonSide === 'B' ? reason : null}
        />
      </div>
      {meta ? (
        <div className="mt-0.5 border-t border-border pt-1 text-2xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

export function MatchCard({
  sideA,
  sideB,
  chipA,
  chipB,
  sets = [],
  winner = null,
  reasonSide = null,
  reason = null,
  meta,
  className = '',
  'data-testid': testId,
}: {
  sideA: ReactNode;
  sideB: ReactNode;
  /** Club/school chip slots — callers pass their own chip component. */
  chipA?: ReactNode;
  chipB?: ReactNode;
  sets?: SetPair[];
  /** Explicit winner when the caller knows it (bracket `winner_side`);
   *  falls back to counting sets. */
  winner?: 'A' | 'B' | null;
  /** Which side the `reason` badge attaches to (the affected side). */
  reasonSide?: 'A' | 'B' | null;
  reason?: MatchReason | null;
  meta?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  const won = winner ?? setsWinner(sets);
  return (
    <div data-testid={testId} className={`min-w-0 ${className}`}>
      <CardSide
        side="A"
        names={sideA}
        chip={chipA}
        won={won === 'A'}
        sets={sets}
        reason={reasonSide === 'A' ? reason : null}
      />
      <CardSide
        side="B"
        names={sideB}
        chip={chipB}
        won={won === 'B'}
        sets={sets}
        reason={reasonSide === 'B' ? reason : null}
      />
      {meta ? (
        <div className="mt-1 border-t border-border pt-1 text-2xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
