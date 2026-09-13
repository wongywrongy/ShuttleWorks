/**
 * ResultEntryForm — the ONE result editor body (O7 / plan D6).
 *
 * Every surface that records a match result renders this: the bracket's
 * Record result modal, the match lists, and Operations' persistent Live
 * panel (inline — Live must never pay a modal cycle per score). The form
 * body is deliberately chrome-free so the modal supplies the title/reference
 * and the rail supplies its own heading.
 *
 * Rules it holds, so no call site re-derives them:
 *   * game count and per-game validity come from the EFFECTIVE scoring rules
 *     (setsToWin, pointsPerSet, deuce, cap) — never a hard-coded 21;
 *   * a blank game stays BLANK. The old editors seeded every field with 0,
 *     which reads as a recorded 0-0 and is a lie about an unplayed game;
 *   * the winner is DERIVED from the games for a played match, and chosen
 *     explicitly for a non-played outcome (walkover / retired / forfeit),
 *     where the point totals contradict the outcome by construction;
 *   * Save commits only a valid result; Cancel writes nothing; a failed save
 *     keeps the entered values on screen.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';

import { INTERACTIVE_BASE, ACCENT_PRESS } from '../../lib/utils';
import type { SetPair } from './MatchCard';

export type ResultOutcome = 'played' | 'walkover' | 'retired' | 'forfeit';

/** Where the write currently stands, using the command queue's own states. */
export type ResultSaveState = 'idle' | 'saving' | 'queued' | 'synced' | 'failed';

export interface EffectiveScoringRules {
  /** Games a side must win to take the match (2 → best of 3). */
  setsToWin: number;
  /** Target score for one game. */
  pointsPerSet: number;
  /** Two-clear-points ending. */
  deuceEnabled: boolean;
  /** Hard ceiling — the score that wins a game outright at deuce. */
  cap: number | null;
}

export interface ResultEntryValue {
  outcome: ResultOutcome;
  winner: 'A' | 'B';
  /** Games actually played, in order. Empty for a walkover. */
  sets: SetPair[];
}

const OUTCOME_LABEL: Record<ResultOutcome, string> = {
  played: 'Played',
  walkover: 'Walkover',
  retired: 'Retired (injury)',
  forfeit: 'Forfeit',
};

const SAVE_WORD: Record<ResultSaveState, string | null> = {
  idle: null,
  saving: 'Saving…',
  queued: 'Saved on this device; will sync when back online',
  synced: 'Saved',
  failed: 'Not saved',
};

export function effectiveScoringRules(config: {
  setsToWin?: number | null;
  pointsPerSet?: number | null;
  deuceEnabled?: boolean | null;
  pointCap?: number | null;
} | null | undefined): EffectiveScoringRules {
  const setsToWin = Math.max(1, config?.setsToWin ?? 2);
  const pointsPerSet = Math.max(1, config?.pointsPerSet ?? 21);
  const deuceEnabled = config?.deuceEnabled ?? true;
  return {
    setsToWin,
    pointsPerSet,
    deuceEnabled,
    cap: deuceEnabled ? (config?.pointCap ?? null) : pointsPerSet,
  };
}

/** Winner of one completed game, or null while it is not yet decidable. */
export function gameWinner(
  a: number,
  b: number,
  rules: EffectiveScoringRules,
): 'A' | 'B' | null {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (!Number.isInteger(a) || !Number.isInteger(b) || lo < 0) return null;
  if (a === b || hi < rules.pointsPerSet) return null;
  if (rules.cap !== null && hi > rules.cap) return null;
  if (!rules.deuceEnabled) {
    if (hi !== rules.pointsPerSet) return null;
  } else if (hi === rules.cap && hi !== rules.pointsPerSet) {
    if (lo < hi - 2) return null;
  } else if (hi === rules.pointsPerSet) {
    if (hi - lo < 2) return null;
  } else if (hi - lo !== 2) return null;
  return a > b ? 'A' : 'B';
}

/** Human sentence for the effective rules — shown once, above the fields. */
export function scoringRulesSentence(rules: EffectiveScoringRules): string {
  const games = rules.setsToWin * 2 - 1;
  const ending = rules.deuceEnabled
    ? (rules.cap === null ? 'two clear points, no maximum' : `two clear points, capped at ${rules.cap}`)
    : `first to ${rules.pointsPerSet}`;
  return `Best of ${games} · ${rules.pointsPerSet} points · ${ending}`;
}

interface RawGame {
  a: string;
  b: string;
}

export interface ResultEntryFormProps {
  sideALabel: string;
  sideBLabel: string;
  rules: EffectiveScoringRules;
  /** `winner` records an outcome only — no game fields (Simple engine). */
  mode?: 'games' | 'winner';
  initialSets?: SetPair[] | null;
  /** Outcomes this surface supports. `played` alone hides the selector. */
  outcomes?: ResultOutcome[];
  initialOutcome?: ResultOutcome;
  submitLabel?: string;
  /** Extra content above the fields — e.g. Operations' per-match format
   *  override, which owns `rules` and re-renders this form with new ones. */
  children?: ReactNode;
  saveState?: ResultSaveState;
  /** Server/queue message kept visible while the editor stays open. */
  error?: string | null;
  onSubmit: (value: ResultEntryValue) => void | Promise<void>;
  onCancel: () => void;
  testId?: string;
}

export function ResultEntryForm({
  sideALabel,
  sideBLabel,
  rules,
  mode = 'games',
  initialSets = null,
  outcomes = ['played'],
  initialOutcome = 'played',
  submitLabel = 'Save result',
  children,
  saveState = 'idle',
  error = null,
  onSubmit,
  onCancel,
  testId = 'result-entry-form',
}: ResultEntryFormProps) {
  const gameCount = Math.max(1, rules.setsToWin * 2 - 1);
  const [outcome, setOutcome] = useState<ResultOutcome>(initialOutcome);
  const [winnerChoice, setWinnerChoice] = useState<'A' | 'B' | null>(null);
  // Stored sparsely and READ through `rows`, so a rules change (Operations
  // lets the rail override the format for one match) resizes the field list
  // without an effect that races the render — and without discarding what is
  // already typed.
  const [games, setGames] = useState<RawGame[]>(() =>
    (initialSets ?? []).map((set) => ({
      a: String(set.sideA),
      b: String(set.sideB),
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  // Belt-and-braces against a double submit: a second Enter/click while the
  // promise is in flight must not enqueue a second command.
  const inFlight = useRef(false);

  const withGames = mode === 'games' && outcome !== 'walkover';
  const rows = useMemo(
    () =>
      Array.from({ length: gameCount }, (_, i) => games[i] ?? { a: '', b: '' }),
    [games, gameCount],
  );

  const parsed = useMemo(() => {
    const entered: Array<{ index: number; a: number; b: number }> = [];
    let fieldError: string | null = null;
    rows.forEach((raw, index) => {
      const hasA = raw.a.trim() !== '';
      const hasB = raw.b.trim() !== '';
      if (!hasA && !hasB) return;
      if (!hasA || !hasB) {
        fieldError ??= `Game ${index + 1} needs a score for both sides.`;
        return;
      }
      const a = Number(raw.a);
      const b = Number(raw.b);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
        fieldError ??= `Game ${index + 1} scores must be whole numbers.`;
        return;
      }
      if (rules.cap !== null && (a > rules.cap || b > rules.cap)) {
        fieldError ??= `Game ${index + 1} cannot go past ${rules.cap}.`;
        return;
      }
      entered.push({ index, a, b });
    });
    // Games must be contiguous from game 1 — a score in game 3 with game 2
    // blank is not a match anyone played.
    const contiguous = entered.every((g, i) => g.index === i);
    if (!contiguous) fieldError ??= 'Fill the games in order.';
    return { entered, fieldError };
  }, [rows, rules.cap]);

  const tally = useMemo(() => {
    let a = 0;
    let b = 0;
    let undecided: number | null = null;
    let extraGame = false;
    for (const game of parsed.entered) {
      if (a >= rules.setsToWin || b >= rules.setsToWin) extraGame = true;
      const won = gameWinner(game.a, game.b, rules);
      if (won === 'A') a += 1;
      else if (won === 'B') b += 1;
      else undecided ??= game.index + 1;
    }
    return { a, b, undecided, extraGame };
  }, [parsed.entered, rules]);

  const derivedWinner: 'A' | 'B' | null =
    tally.a >= rules.setsToWin ? 'A' : tally.b >= rules.setsToWin ? 'B' : null;

  const effectiveWinner = withGames && outcome === 'played' ? derivedWinner : winnerChoice;

  const validation = ((): string | null => {
    if (parsed.fieldError) return parsed.fieldError;
    if (withGames && tally.extraGame) return 'Remove games played after the match was decided.';
    if (withGames && tally.undecided !== null && (outcome === 'played' || tally.undecided !== parsed.entered.length)) {
      return `Game ${tally.undecided} is not a finished game under the current rules.`;
    }
    if (withGames && tally.undecided !== null && outcome !== 'played') {
      const last = parsed.entered.at(-1);
      if (last) {
        const hi = Math.max(last.a, last.b);
        const unfinished = (hi < rules.pointsPerSet || (rules.deuceEnabled && Math.abs(last.a - last.b) <= 1)) && (rules.cap === null || hi < rules.cap);
        if (!unfinished) return 'The interrupted game continued past a legal ending.';
      }
    }
    if (withGames && outcome !== 'played' && derivedWinner && winnerChoice !== derivedWinner) return 'The awarded side cannot contradict a completed match.';
    if (outcome === 'played') {
      if (!withGames) return winnerChoice ? null : 'Choose the winning side.';
      if (!derivedWinner) {
        return parsed.entered.length === 0
          ? 'Enter the game scores.'
          : `No side has won ${rules.setsToWin} game${rules.setsToWin === 1 ? '' : 's'} yet.`;
      }
      return null;
    }
    return winnerChoice ? null : 'Choose which side is awarded the match.';
  })();

  const canSubmit = validation === null && !submitting && saveState !== 'saving';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || inFlight.current || !effectiveWinner) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        outcome,
        winner: effectiveWinner,
        sets: withGames
          ? parsed.entered.map((g) => ({ sideA: g.a, sideB: g.b }))
          : [],
      });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const setGame = (index: number, side: 'a' | 'b', value: string) =>
    setGames(() =>
      rows.map((g, i) => (i === index ? { ...g, [side]: value } : g)),
    );

  const inputCls =
    'w-full rounded-sm border border-border bg-card px-1 py-1 text-center text-sm sw-num tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30';
  const saveWord = SAVE_WORD[saveState];

  return (
    <form onSubmit={submit} data-testid={testId} className="space-y-3">
      {outcomes.length > 1 ? (
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Outcome</legend>
          <div className="flex flex-wrap gap-1.5">
            {outcomes.map((candidate) => (
              <label
                key={candidate}
                className={`${INTERACTIVE_BASE} inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 text-xs ${
                  outcome === candidate
                    ? 'border-accent bg-action-selected-bg text-action-selected-foreground'
                    : 'border-border bg-card text-foreground hover:border-accent'
                }`}
              >
                <input
                  type="radio"
                  name="result-outcome"
                  className="sr-only"
                  checked={outcome === candidate}
                  onChange={() => setOutcome(candidate)}
                />
                {OUTCOME_LABEL[candidate]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {children}

      {withGames ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{scoringRulesSentence(rules)}</p>
          {/* Side-aligned fields: Side A's column sits under Side A's name,
              Side B's under Side B's, so a game reads across in one line. */}
          <div className="mb-1 grid grid-cols-[3.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5 text-xs text-muted-foreground">
            <span />
            <span className="break-words text-right font-medium text-foreground">{sideALabel}</span>
            <span />
            <span className="break-words font-medium text-foreground">{sideBLabel}</span>
          </div>
          {rows.map((game, index) => (
            <div
              key={index}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5"
            >
              <span className="text-xs text-muted-foreground">Game {index + 1}</span>
              <input
                type="number"
                min={0}
                max={rules.cap ?? undefined}
                inputMode="numeric"
                value={game.a}
                placeholder="–"
                aria-label={`Game ${index + 1} score for ${sideALabel}`}
                onChange={(e) => setGame(index, 'a', e.target.value)}
                className={inputCls}
              />
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
              <input
                type="number"
                min={0}
                max={rules.cap ?? undefined}
                inputMode="numeric"
                value={game.b}
                placeholder="–"
                aria-label={`Game ${index + 1} score for ${sideBLabel}`}
                onChange={(e) => setGame(index, 'b', e.target.value)}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      ) : null}

      {/* An explicit winner is required whenever the games cannot decide one:
          a walkover has no games, and a retirement/forfeit contradicts them. */}
      {outcome !== 'played' || !withGames ? (
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">
            {outcome === 'played' ? 'Winner' : 'Match awarded to'}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(['A', 'B'] as const).map((side) => (
              <label
                key={side}
                className={`${INTERACTIVE_BASE} inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 break-words rounded-sm border px-2 py-1 text-xs ${
                  winnerChoice === side
                    ? 'border-accent bg-action-selected-bg text-action-selected-foreground'
                    : 'border-border bg-card text-foreground hover:border-accent'
                }`}
              >
                <input
                  type="radio"
                  name="result-winner"
                  className="sr-only"
                  checked={winnerChoice === side}
                  onChange={() => setWinnerChoice(side)}
                />
                {side === 'A' ? sideALabel : sideBLabel}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* Derived summary — the sentence that will be written, in the words a
          director reads back. */}
      <p
        className="text-xs text-foreground"
        data-testid={`${testId}-summary`}
        aria-live="polite"
      >
        {effectiveWinner
          ? `${effectiveWinner === 'A' ? sideALabel : sideBLabel} wins${
              withGames && parsed.entered.length > 0
                ? ` ${tally.a}–${tally.b}`
                : ''
            }${outcome === 'played' ? '' : ` (${OUTCOME_LABEL[outcome].toLowerCase()})`}`
          : (validation ?? '')}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        {saveWord ? (
          <span
            aria-live="polite"
            data-testid={`${testId}-save-state`}
            className={`mr-auto text-xs ${saveState === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {saveWord}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className={`${INTERACTIVE_BASE} rounded-sm border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted/40`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          data-testid={`${testId}-submit`}
          className={`${INTERACTIVE_BASE} rounded-sm bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink ${ACCENT_PRESS} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {submitting || saveState === 'saving' ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
