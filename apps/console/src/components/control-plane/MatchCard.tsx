/**
 * MatchCard — the shared BWF-style match-presentation atom (SP-CONSOLE-REFINE
 * G6). One anatomy reused everywhere a match is shown as a card: sides
 * stacked vertically, a winner marker on the winning side, the recorded games
 * as ONE CENTRED PAIRED LANE BETWEEN the two sides ("18–21, 21–15, 21–13" —
 * match-card contract §3.4 as amended by the P0 operator-visual-fixes pass),
 * inline RET/W.O. badges next to the affected side, and an optional footer
 * meta strip (round · event · court · time).
 *
 * List rows stay table rows; they adopt the SAME `ScoreLane` in their own
 * centred score column between Side A and Side B, so a game reads identically
 * on a row, a card, a bracket node and a court card. No game score carries
 * emphasis anywhere: the winning side's NAME does, from the recorded outcome
 * (`recordedWinner` / the engine's `winner_side`), never from counting games.
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

/**
 * The winner of a match from its AUTHORITATIVE RECORDED OUTCOME.
 *
 * match-card contract §2.7 rule 4 / §3.5: the match winner is never inferred
 * from per-game totals — retirement and walkover contradict them by
 * construction. The Bracket engine records `winner_side` directly; the Meet
 * engine records an aggregate `score` (games won per side, written by the Run
 * surface's `ScoreEditor`), and THAT aggregate — not a count over the
 * per-game `sets` — is the meet's recorded outcome. `null` whenever nothing
 * has been recorded.
 *
 * The former `setsWinner(sets)` helper, which counted games, is deleted: it
 * was exactly the inference §3.5 forbids on a render path.
 */
export function recordedWinner(
  score: SetPair | null | undefined,
): 'A' | 'B' | null {
  if (!score) return null;
  if (score.sideA === score.sideB) return null;
  return score.sideA > score.sideB ? 'A' : 'B';
}

/** The winner marker — a small filled dot, the BWF/tournamentsoftware cue. */
export function WinnerDot({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Winner"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-status-success-fg ${className}`}
    />
  );
}

/** En dash between the two numbers of one game (match-card §3.4), comma
 *  between games. The FIRST number always belongs to the FIRST-LISTED side. */
const EN_DASH = '–';

/** The plain-text form of a paired ledger: `18–21, 21–15, 21–13`. Exported
 *  so exports and accessible summaries spell it exactly once. */
export function formatGamePairs(sets: SetPair[] | null | undefined): string {
  if (!sets || sets.length === 0) return '';
  return sets.map((s) => `${s.sideA}${EN_DASH}${s.sideB}`).join(', ');
}

/**
 * ScoreLane — the ONE centred lane of paired games that sits BETWEEN the two
 * opponents on every match surface (match-card contract §3.4, as amended by
 * the P0 operator-visual-fixes pass).
 *
 *   18–21, 21–15, 21–13
 *
 * Three rules it enforces structurally, so no caller can reintroduce them:
 *
 *  1. **Paired, not per-side.** A game is one cell holding both numbers, so
 *     the reader never has to align two distant columns to read a game. The
 *     first number is the first-listed side's, always.
 *  2. **No emphasis of any kind.** Not for a completed game, not for a live
 *     one. `game.winner` drives no ink; the winning side's NAME carries the
 *     match outcome (§3.0), and only from the recorded outcome.
 *  3. **The live game shares the lane.** A running score is just the last
 *     pair, in the same weight — nothing is fabricated to fill it.
 *
 * The lane collapses to nothing when there are no games AND no reason badge
 * (§3.4 "collapse"): no cell, no reserved width, no invisible marker.
 */
export function ScoreLane({
  sets,
  reason,
  sideALabel,
  sideBLabel,
  size = 'text-2sm',
  className = '',
  'data-testid': testId,
}: {
  sets: SetPair[];
  reason?: MatchReason | null;
  /** Side names, for the per-game accessible text §3.4 requires
   *  ("Game 2, Ana Silva 21, Ben Ito 19"). Omitted where the surface has no
   *  names to give (the compact chip). */
  sideALabel?: string;
  sideBLabel?: string;
  /** The lane's type scale. A separate prop rather than something a caller
   *  passes through `className`, because two `text-*` utilities on one
   *  element resolve by stylesheet order, not by the order they were
   *  written — which made "just override it" silently unreliable. The
   *  venue board is the one surface that needs a different one (its score
   *  is read across a hall); everywhere else takes the default. */
  size?: string;
  className?: string;
  'data-testid'?: string;
}) {
  if (sets.length === 0 && !reason) return null;
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${size} tabular-nums text-foreground ${className}`}
    >
      {reason ? (
        <span className="rounded-sm bg-muted px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {REASON_BADGE[reason]}
        </span>
      ) : null}
      {sets.map((s, i) => (
        <span
          key={i}
          aria-label={
            sideALabel && sideBLabel
              ? `Game ${i + 1}, ${sideALabel} ${s.sideA}, ${sideBLabel} ${s.sideB}`
              : undefined
          }
        >
          {s.sideA}
          {EN_DASH}
          {s.sideB}
          {i < sets.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  );
}

/** One stacked side inside a MatchCard: chip slot · names · winner dot.
 *  The SCORES are not here — they live once, in the centred lane between the
 *  two sides (match-card §3.4). */
function CardSide({
  side,
  names,
  chip,
  won,
  reason,
}: {
  side: 'A' | 'B';
  names: ReactNode;
  chip?: ReactNode;
  won: boolean;
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
          <span className="ml-1.5 rounded-sm bg-muted px-1 align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {REASON_BADGE[reason]}
          </span>
        ) : null}
      </span>
      <span className="w-3 shrink-0 text-center">{won ? <WinnerDot /> : null}</span>
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
 *  chip (once per side, never per player row) and the contingency badge.
 *
 *  The SCORE is not a per-side element any more: it renders once, in the
 *  centred paired lane between the two blocks (match-card §3.4). Winner
 *  reads by weight on the caller's NAME rows plus the mark — never by ink on
 *  a game score. */
function ResultSideBlock({
  side,
  rows,
  rail,
  won,
  reason,
}: {
  side: 'A' | 'B';
  rows: ReactNode;
  /** Side-level identity — Meet school chip, Bracket event badge. */
  rail?: ReactNode;
  won: boolean;
  reason?: MatchReason | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 py-1.5" data-side={side}>
      <div className="min-w-0 flex-1">{rows}</div>
      {won ? <WinnerDot className="shrink-0" /> : null}
      {rail ? <span className="shrink-0">{rail}</span> : null}
      {reason ? (
        <span className="shrink-0 rounded-sm bg-muted px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {REASON_BADGE[reason]}
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
  winner,
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
  /** The authoritative match winner (match-card contract §3.5): comes from
   *  `outcome.winner`, NEVER from counting `sets` — a retirement or a
   *  walkover can contradict the point totals by construction. `null` while
   *  the match is unfinished; the caller must not fall back to
   *  `setsWinner(sets)` (deleted from this component). */
  winner: 'A' | 'B' | null;
  reasonSide?: 'A' | 'B' | null;
  reason?: MatchReason | null;
  meta?: ReactNode;
  'data-testid'?: string;
}) {
  const won = winner;
  return (
    <div data-testid={testId} className="min-w-0">
      <div className="flex flex-col divide-y divide-border/60">
        <ResultSideBlock
          side="A"
          rows={sideA}
          rail={railA}
          won={won === 'A'}
          reason={reasonSide === 'A' ? reason : null}
        />
        {sets.length > 0 ? (
          <div className="flex justify-center py-1">
            <ScoreLane sets={sets} data-testid="result-score-lane" />
          </div>
        ) : null}
        <ResultSideBlock
          side="B"
          rows={sideB}
          rail={railB}
          won={won === 'B'}
          reason={reasonSide === 'B' ? reason : null}
        />
      </div>
      {meta ? (
        <div className="mt-0.5 border-t border-border pt-1 text-xs text-muted-foreground">
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
  winner,
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
  /** The authoritative match winner (match-card contract §3.5): comes from
   *  `outcome.winner`, NEVER from counting `sets` (`winner ?? setsWinner(sets)`
   *  is deleted — a retirement or walkover can contradict the point totals
   *  by construction). `null` while `outcome.kind === 'in_play'`. */
  winner: 'A' | 'B' | null;
  /** Which side the `reason` badge attaches to (the affected side). */
  reasonSide?: 'A' | 'B' | null;
  reason?: MatchReason | null;
  meta?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  const won = winner;
  return (
    <div data-testid={testId} className={`min-w-0 ${className}`}>
      <CardSide
        side="A"
        names={sideA}
        chip={chipA}
        won={won === 'A'}
        reason={reasonSide === 'A' ? reason : null}
      />
      {sets.length > 0 ? (
        <div className="flex justify-center py-0.5">
          <ScoreLane sets={sets} data-testid="match-card-score-lane" />
        </div>
      ) : null}
      <CardSide
        side="B"
        names={sideB}
        chip={chipB}
        won={won === 'B'}
        reason={reasonSide === 'B' ? reason : null}
      />
      {meta ? (
        <div className="mt-1 border-t border-border pt-1 text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
