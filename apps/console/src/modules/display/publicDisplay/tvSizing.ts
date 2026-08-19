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
