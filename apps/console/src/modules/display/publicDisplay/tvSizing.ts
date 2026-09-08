/**
 * TV sizing — pure derivations shared by MeetDisplayPage (the real public
 * board) and DisplayPreview (the Display Configuration live preview).
 *
 * Both consumers used to carry a byte-for-byte copy of this logic
 * (cardHeightPx / SIZES / GRID_COLS / tvAccent normalization) — see
 * task-7-brief.md item 4. Extracted here to remove the drift risk: any
 * future tweak to card sizing or the accent fallback now has one place
 * to change instead of two that must be kept in sync by hand.
 */

export type TvCardSize = 'auto' | 'compact' | 'comfortable' | 'large';

const DEFAULT_ACCENT = '#10b981';

/** Hex accent (``#RRGGBB``) validation + normalization, with a fixed
 *  emerald fallback for anything unset or malformed. */
export function resolveTvAccent(tvAccent: string | null | undefined): string {
  if (!tvAccent) return DEFAULT_ACCENT;
  const bare = tvAccent.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(bare)) return DEFAULT_ACCENT;
  return tvAccent.startsWith('#') ? tvAccent : `#${tvAccent}`;
}

/** Card height in pixels. `isFullscreen` only affects the 'auto' tier
 *  (bigger cards once the board takes over the whole screen); every
 *  explicit size is fullscreen-invariant. Defaults `isFullscreen` to
 *  false so DisplayPreview (never fullscreen) can omit the argument. */
export function resolveCardHeightPx(
  tvCardSize: TvCardSize | null | undefined,
  isFullscreen = false
): number {
  if (tvCardSize === 'compact') return 72;
  if (tvCardSize === 'comfortable') return 128;
  if (tvCardSize === 'large') return 176;
  return isFullscreen ? 128 : 96;
}

export interface CardSizeClasses {
  courtNumSize: string;
  eventCodeSize: string;
  playerSize: string;
  cardPadX: string;
}

const SIZE_TIERS = {
  sm: { courtNum: 'text-3xl tracking-tight', eventCode: 'text-base', player: 'text-base', padX: 'px-4' },
  md: { courtNum: 'text-5xl tracking-tighter', eventCode: 'text-2xl', player: 'text-2xl', padX: 'px-4' },
  lg: { courtNum: 'text-6xl tracking-tighter', eventCode: 'text-3xl', player: 'text-3xl', padX: 'px-6' },
  xl: { courtNum: 'text-7xl tracking-tighter', eventCode: 'text-4xl', player: 'text-4xl', padX: 'px-6' },
} as const;

/** Type-scale classes for a court card, keyed off its computed height. */
export function resolveCardSizeClasses(cardHeightPx: number): CardSizeClasses {
  const sizeTier =
    cardHeightPx >= 160 ? 'xl' : cardHeightPx >= 120 ? 'lg' : cardHeightPx >= 96 ? 'md' : 'sm';
  const { courtNum, eventCode, player, padX } = SIZE_TIERS[sizeTier];
  return { courtNumSize: courtNum, eventCodeSize: eventCode, playerSize: player, cardPadX: padX };
}

/**
 * The SIGNAGE HIERARCHY (match-card contract §4.4, rewritten by the P0
 * operator-visual-fixes pass): on a venue board the **court number is the
 * largest element on the card**, the participant names are next, and the
 * live score is readable at the intended distance — in that order.
 *
 * This inverts what the board used to do: `resolveSignageNameSize` returned
 * `text-5xl`–`text-7xl` for the names while the court number sat in the
 * card's header band at `text-xs`–`text-base`, so the one thing a player
 * crosses a hall to find was the smallest thing on the tile.
 *
 * Three separate scales rather than one, because the card's other text
 * (`resolveCardSizeClasses().playerSize`) also feeds `BracketResultsView`'s
 * historical results rows, where this hierarchy does not apply.
 *
 * The board is judged PHYSICALLY (§4.4 "Envelope") — at the real screen size
 * and viewing distance. The ORDERING is the contract; these tiers are its
 * current expression, not a pixel target.
 */
export function resolveSignageCourtSize(cardHeightPx: number): string {
  if (cardHeightPx >= 160) return 'text-9xl';
  if (cardHeightPx >= 120) return 'text-8xl';
  if (cardHeightPx >= 96) return 'text-7xl';
  return 'text-6xl';
}

/**
 * The board wraps a participant name BETWEEN WORDS ONLY (debt OPR-0908-10).
 *
 * The default `overflow-wrap: break-word` the name lines used to carry made
 * a surname splittable at any character, so a name column squeezed below the
 * width of its longest word rendered "Koki Watanab / e" on the wall — a
 * spectator scanning for their court reads a name that does not exist. Wrap
 * between words, never inside one, and never hyphenate: a name that still
 * does not fit steps DOWN a type tier (`stepDownSignageNameSize`), because a
 * smaller true name beats a larger false one.
 *
 * Carried as an inline style rather than a utility class so the rule is one
 * value both boards share AND is assertable from a rendered test — a class
 * list only mirrors itself.
 */
export const SIGNAGE_NAME_WRAP = {
  overflowWrap: 'normal',
  wordBreak: 'normal',
  hyphens: 'none',
} as const;

/** Name type tiers, smallest first — the ladder `stepDownSignageNameSize`
 *  walks. `text-2xl` is the floor: below it the board stops being signage. */
export const SIGNAGE_NAME_TIERS = ['text-2xl', 'text-3xl', 'text-4xl', 'text-5xl'] as const;

/**
 * Longest word, in characters, across a card's participant lines.
 *
 * Words, not lines: with `SIGNAGE_NAME_WRAP` in force the longest WORD is
 * the minimum width a name column can take, so it is the only length that
 * can overflow a card.
 */
export function longestWordChars(lines: readonly string[]): number {
  let longest = 0;
  for (const line of lines) {
    for (const word of line.split(/\s+/)) {
      if (word.length > longest) longest = word.length;
    }
  }
  return longest;
}

/**
 * The character budget above which a name steps down one tier.
 *
 * Measured on the demo board (2026-09-08, `docs/screenshots/ui-review/
 * opr-board-wrap/`): a capitalised Latin name in the board's semibold face
 * measures ≈0.61em per character at its widest ("Watanabe" = 146px at 30px),
 * and the narrowest name column a card produces while a three-game score
 * column shares its row is ≈200px. 200 / (0.61 × 30) ≈ 11 characters.
 */
const SIGNAGE_MAX_WORD_CHARS = 11;

/**
 * One tier down when the longest word cannot be expected to fit, else the
 * tier unchanged. **One** step, never two: the alternative to a slightly
 * smaller name is a broken one, not a smaller board.
 */
export function stepDownSignageNameSize(size: string, lines: readonly string[]): string {
  if (longestWordChars(lines) <= SIGNAGE_MAX_WORD_CHARS) return size;
  const idx = SIGNAGE_NAME_TIERS.indexOf(size as (typeof SIGNAGE_NAME_TIERS)[number]);
  return idx > 0 ? SIGNAGE_NAME_TIERS[idx - 1] : size;
}

/** Participant names — one step below the court number, one above the score.
 *  Pass the card's participant lines to let a very long single word step the
 *  tier down rather than break mid-word. */
export function resolveSignageNameSize(cardHeightPx: number, lines: readonly string[] = []): string {
  const base =
    cardHeightPx >= 160
      ? 'text-5xl'
      : cardHeightPx >= 120
        ? 'text-4xl'
        : cardHeightPx >= 96
          ? 'text-3xl'
          : 'text-2xl';
  return stepDownSignageNameSize(base, lines);
}

/** The live score lane — readable, and deliberately below the names. */
export function resolveSignageScoreSize(cardHeightPx: number): string {
  if (cardHeightPx >= 160) return 'text-4xl';
  if (cardHeightPx >= 120) return 'text-3xl';
  if (cardHeightPx >= 96) return 'text-2xl';
  return 'text-xl';
}

// Tailwind safelist won't pick up dynamic class names so we keep the
// literal strings; lookup beats a 4-deep ternary at the callsite.
const GRID_COLS: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

/** Tailwind grid-cols class for an already-resolved column count
 *  (see `courtLayout.ts#defaultColumns` for how that count is derived). */
export function resolveGridColsClass(columns: 1 | 2 | 3 | 4): string {
  return GRID_COLS[columns];
}
