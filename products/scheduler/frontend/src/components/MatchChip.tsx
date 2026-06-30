/**
 * MatchChip — the ONE shared match-chip primitive.
 *
 * A match is a match: both the Plan board (UnifiedOpsBoard's draggable blocks)
 * and the Run board (RunBoard's lane cells) render THIS component so the two
 * surfaces can never drift into two different looks again. It is presentational
 * and layout-agnostic — positioning (absolute fill in the Gantt vs flex cell in
 * Run), drag wiring, padding, and the `data-testid` are all the caller's
 * concern, passed through `className` / `style` / spread props / `ref`.
 *
 * Owned by neither product: it lives in the shared `components/` layer and
 * depends only on `lib/eventColors` — it must NOT import from `products/*`.
 *
 * Color encoding is per-surface via `tone`:
 *   - `discipline` (Plan): fill = event-type colour; live state = the ring.
 *   - `state`      (Run):  fill = live state; discipline is not encoded.
 * Priority, regardless of tone: `selected` wins both the fill (accent) and the
 * ring (accent); otherwise `late` wins the ring (warning). The Run board also
 * paints its own "Late" text badge off `match.late` independent of selection.
 */
import { forwardRef } from 'react';
import { getEventColor } from '../lib/eventColors';

export type MatchChipState = 'scheduled' | 'called' | 'playing' | 'done';
export type MatchChipSource = 'meet' | 'bracket';
export type MatchChipTone = 'discipline' | 'state';

// ── source left-edge (sky=meet, violet=bracket) ───────────────────────────
const SOURCE_EDGE: Record<MatchChipSource, string> = {
  meet: 'border-l-2 border-l-sky-500',
  bracket: 'border-l-2 border-l-violet-500',
};

// ── ring per state (discipline tone surfaces state via the ring) ──────────
const STATE_RING: Record<MatchChipState, string> = {
  scheduled: '',
  called: 'ring-2 ring-inset ring-status-called',
  playing: 'ring-2 ring-inset ring-status-live',
  done: 'ring-2 ring-inset ring-status-done',
};

// ── fill per state (state tone encodes state in the body) ─────────────────
const STATE_FILL: Record<MatchChipState, string> = {
  scheduled: 'bg-card border-border text-foreground hover:brightness-95',
  called: 'bg-status-called/10 border-status-called/40 text-foreground hover:brightness-95',
  playing: 'bg-status-live/10 border-status-live/40 text-foreground hover:brightness-95',
  done: 'bg-status-done/10 border-status-done/40 text-foreground hover:brightness-95',
};

export interface MatchChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Short code painted on the chip (event rank / play-unit id). */
  label: string;
  source: MatchChipSource;
  /** Live lifecycle state (already mapped to RunStatus by the caller). */
  state: MatchChipState;
  /** Overdue flag — wins the ring (warning) when set. */
  late?: boolean;
  selected?: boolean;
  /** Per-surface colour encoding. Defaults to `discipline` (Plan). */
  tone?: MatchChipTone;
  /** Event-type key for `getEventColor` — only used by the `discipline` tone. */
  colorKey?: string;
  /** Optional team labels for the second line (only shown when `showSides`). */
  sideA?: string;
  sideB?: string;
  /** Render a compact, truncating `sideA v sideB` line under the label. The
   *  Gantt (Plan) is label-only; the Run board opts in so the floor sees teams
   *  at a glance. Truncation + the parent's min-w-0 keep it from forcing width. */
  showSides?: boolean;
  /** Click-to-select. Mapped onto the button's `onClick`. */
  onSelect?: () => void;
  /** Allow `data-*` passthrough (e.g. `data-testid`) from callers. */
  [dataAttr: `data-${string}`]: unknown;
}

export const MatchChip = forwardRef<HTMLButtonElement, MatchChipProps>(function MatchChip(
  { label, source, state, late = false, selected = false, tone = 'discipline', colorKey, sideA, sideB, showSides = false, onSelect, className, children, ...rest },
  ref,
) {
  const fill = selected
    ? 'bg-accent/10 border-accent text-accent'
    : tone === 'state'
      ? STATE_FILL[state]
      : (() => {
          const c = getEventColor(colorKey);
          return `${c.bg} ${c.border} text-foreground hover:brightness-95`;
        })();

  const ring = selected
    ? 'ring-1 ring-accent/30'
    : late
      ? 'ring-2 ring-inset ring-status-warning'
      : tone === 'discipline'
        ? STATE_RING[state]
        : '';

  return (
    <button
      ref={ref}
      type="button"
      data-source={source}
      onClick={onSelect}
      className={[
        'group relative flex flex-col justify-center overflow-hidden rounded border text-left shadow-sm transition-all',
        fill,
        SOURCE_EDGE[source],
        ring,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <span className="truncate text-2xs font-semibold leading-tight">{label}</span>
      {showSides && sideA != null && sideB != null && (
        <span className="mt-0.5 truncate text-2xs leading-tight opacity-80">
          {sideA} <span className="opacity-60">v</span> {sideB}
        </span>
      )}
      {children}
    </button>
  );
});
