/**
 * MatchCard — the shared BWF-style match-presentation atom (SP-CONSOLE-REFINE
 * G6). One match INTERPRETATION — one score authority, one canonical A/B side
 * order, one outcome vocabulary — rendered through TWO EXPLICIT LAYOUTS
 * (operator/public remediation P1; match-card contract, "Amended 2026-09-08"):
 *
 *  - **stacked** (`SideScores`): two opponent sides one above the other, each
 *    with its own aligned game-score column beside it. Bracket nodes, result
 *    and history cards, venue-board court cards. The centred paired lane that
 *    used to sit BETWEEN the two sides is withdrawn here: it asked the reader
 *    to map a number to a name by position across a name line.
 *  - **row** (`ScoreLane`): one horizontal record whose paired games live in
 *    one dedicated, consistently aligned cell — operator row sheets and
 *    compact schedule/list rows, where a per-side column has no second row to
 *    align with.
 *
 * Both carry inline RET/W.O. badges next to the affected side (an outcome
 * appears exactly once) and an optional footer meta strip (round · event ·
 * court · time). No game score carries emphasis in either layout: the winning
 * side's NAME does, from the recorded outcome (`recordedWinner` / the
 * engine's `winner_side`), never from counting games.
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
 * ScoreLane — the paired-game lane for the `row` layout: one dedicated,
 * consistently aligned cell holding every recorded game (match-card contract
 * §3.4, scoped to horizontal rows by the 2026-09-08 amendment). Stacked
 * surfaces use `SideScores` instead.
 *
 *   18–21, 21–15, 21–13
 *
 * Three rules it enforces structurally, so no caller can reintroduce them:
 *
 *  1. **Paired, in one cell.** On a horizontal row there is no second row to
 *     align a per-side column against, so a game is one cell holding both
 *     numbers. The first number is the first-listed side's, always.
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

/**
 * The layout a match renderer uses (operator/public remediation P1, the
 * match-card contract's "Amended 2026-09-08" table).
 *
 *  - `stacked` — two opponent sides one above the other, each with its OWN
 *    aligned game-score column beside it. Bracket nodes, result/history
 *    cards and venue-board court cards. This is the BWF reading: a game is
 *    one COLUMN, and the number beside a name belongs to that name.
 *  - `row` — one horizontal record: the paired lane (`21–18, 19–21`) stays a
 *    single dedicated, consistently aligned cell. Operator row sheets and
 *    compact schedule/list rows.
 *
 * The centred lane BETWEEN two stacked sides — the universal treatment the
 * 2026-09-07 passes shipped — is withdrawn: it made the reader map a number
 * to a name by position across a name line, and it fabricated a third row
 * inside a two-row object.
 */
export type MatchLayout = 'stacked' | 'row';

/**
 * SideScores — ONE side's game scores as aligned, equal-width columns
 * (contract rule 2). One cell per recorded game, in canonical game order,
 * carrying that side's number only; the sibling side renders the same number
 * of cells at the same widths, so game N sits in the same column on both
 * rows without the reader aligning anything.
 *
 * Widths are `em`-based, so a venue board that scales `size` up scales the
 * columns with it and the two rows still line up.
 *
 * Zero is a score and prints as `0`; a MISSING number in a recorded game
 * prints nothing (an empty cell of the same width, so the column survives);
 * a match with no games renders no container at all — not-yet-started is the
 * absence of the ledger, not an empty one (rule 7).
 */
export function SideScores({
  sets,
  side,
  sideLabel,
  size = 'text-2sm',
  className = '',
  'data-testid': testId,
}: {
  sets: SetPair[];
  side: 'A' | 'B';
  /** This side's name, for the per-game accessible label rule 2 requires. */
  sideLabel?: string;
  size?: string;
  className?: string;
  'data-testid'?: string;
}) {
  if (sets.length === 0) return null;
  return (
    <span
      data-testid={testId}
      data-side-scores={side}
      className={`inline-flex shrink-0 items-baseline gap-[0.3em] whitespace-nowrap ${size} tabular-nums text-foreground ${className}`}
    >
      {sets.map((s, i) => {
        const value = side === 'A' ? s.sideA : s.sideB;
        return (
          <span
            key={i}
            className="inline-block min-w-[1.6em] text-right"
            aria-label={
              sideLabel ? `Game ${i + 1}, ${sideLabel} ${value}` : undefined
            }
          >
            {typeof value === 'number' ? value : ''}
          </span>
        );
      })}
    </span>
  );
}

/** One stacked side inside a MatchCard: chip slot · names · this side's own
 *  aligned score column · winner dot (contract rules 1–2, 5). */
function CardSide({
  side,
  names,
  chip,
  won,
  reason,
  sets = [],
  sideLabel,
}: {
  side: 'A' | 'B';
  names: ReactNode;
  chip?: ReactNode;
  won: boolean;
  reason?: MatchReason | null;
  sets?: SetPair[];
  sideLabel?: string;
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
      <SideScores sets={sets} side={side} sideLabel={sideLabel} />
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
 *  P1: the SCORE is a per-side element again — this block carries its own
 *  `SideScores` column, and the sibling block carries the matching one at
 *  the same widths, so game N reads down one column. Winner reads by weight
 *  on the caller's NAME rows plus the mark — never by ink on a game
 *  score. */
function ResultSideBlock({
  side,
  rows,
  rail,
  won,
  reason,
  sets = [],
  sideLabel,
}: {
  side: 'A' | 'B';
  rows: ReactNode;
  /** Side-level identity — Meet school chip, Bracket event badge. */
  rail?: ReactNode;
  won: boolean;
  reason?: MatchReason | null;
  sets?: SetPair[];
  sideLabel?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 py-1.5" data-side={side}>
      <div className="min-w-0 flex-1">{rows}</div>
      <SideScores sets={sets} side={side} sideLabel={sideLabel} />
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
 * panels (INS-N1), rendered as TWO SIDE BLOCKS (RES-1) in the STACKED
 * layout: score is a per-side fact, so each block owns its own aligned
 * `SideScores` column plus a rail (identity chip once per side) with the
 * caller's INTERACTIVE
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
  sideALabel,
  sideBLabel,
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
  /** Side names for the per-game accessible labels (contract rule 2). */
  sideALabel?: string;
  sideBLabel?: string;
  meta?: ReactNode;
  'data-testid'?: string;
}) {
  const won = winner;
  return (
    <div data-testid={testId} className="min-w-0">
      {/* P1: the centred lane that used to sit BETWEEN these two blocks is
          gone. A result card is a STACKED layout, so each side carries its
          own aligned score column (contract rule 4) and the two columns line
          up game-for-game because `SideScores` fixes the cell width. */}
      <div className="flex flex-col divide-y divide-border/60">
        <ResultSideBlock
          side="A"
          rows={sideA}
          rail={railA}
          won={won === 'A'}
          reason={reasonSide === 'A' ? reason : null}
          sets={sets}
          sideLabel={sideALabel}
        />
        <ResultSideBlock
          side="B"
          rows={sideB}
          rail={railB}
          won={won === 'B'}
          reason={reasonSide === 'B' ? reason : null}
          sets={sets}
          sideLabel={sideBLabel}
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
  layout = 'stacked',
  sideALabel,
  sideBLabel,
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
  /** Explicit layout variant (P1). `stacked` gives each side its own
   *  aligned score column; `row` keeps the paired lane in one dedicated
   *  cell between the two sides. */
  layout?: MatchLayout;
  sideALabel?: string;
  sideBLabel?: string;
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
  const stacked = layout === 'stacked';
  return (
    <div data-testid={testId} data-match-layout={layout} className={`min-w-0 ${className}`}>
      <CardSide
        side="A"
        names={sideA}
        chip={chipA}
        won={won === 'A'}
        reason={reasonSide === 'A' ? reason : null}
        sets={stacked ? sets : []}
        sideLabel={sideALabel}
      />
      {!stacked && sets.length > 0 ? (
        <div className="flex justify-center py-0.5">
          <ScoreLane
            sets={sets}
            sideALabel={sideALabel}
            sideBLabel={sideBLabel}
            data-testid="match-card-score-lane"
          />
        </div>
      ) : null}
      <CardSide
        side="B"
        names={sideB}
        chip={chipB}
        won={won === 'B'}
        reason={reasonSide === 'B' ? reason : null}
        sets={stacked ? sets : []}
        sideLabel={sideBLabel}
      />
      {meta ? (
        <div className="mt-1 border-t border-border pt-1 text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
