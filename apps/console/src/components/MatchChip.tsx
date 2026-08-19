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
 * depends only on `lib/eventColors` — it must NOT import from `modules/*`.
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

type MatchChipState = 'scheduled' | 'called' | 'playing' | 'done';
type MatchChipSource = 'meet' | 'bracket';
type MatchChipTone = 'discipline' | 'state';

// ── source initial (M=meet, B=bracket) painted as a small square ───────────
const SOURCE_INITIAL: Record<MatchChipSource, string> = { meet: 'M', bracket: 'B' };

// ── ring per state (discipline tone surfaces state via the ring) ──────────
const STATE_RING: Record<MatchChipState, string> = {
  scheduled: '',
  called: 'ring-2 ring-inset ring-status-called',
  playing: 'ring-2 ring-inset ring-status-live',
  done: 'ring-2 ring-inset ring-status-done',
};

// ── fill per state — "3b muted-solid" (state tone) ────────────────────────
// Active states (playing/called) fill with a muted solid + light ink; quiet
// states (scheduled/done) stay outlined. Hover lifts brightness, never restyles.
const STATE_FILL: Record<MatchChipState, string> = {
  scheduled: 'bg-card border-border text-ink-3 hover:brightness-110',
  called: 'bg-status-called-solid border-status-called-border text-status-called-ink hover:brightness-110',
  playing: 'bg-status-live-solid border-status-live-border text-status-live-ink hover:brightness-110',
  done: 'bg-surface-band border-border/60 text-muted-foreground hover:brightness-110',
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
  /** Render a compact `sideA v sideB` line under the label. The Gantt (Plan)
   *  is label-only; the Run board opts in so the floor sees teams at a glance.
   *  It WRAPS rather than truncating — the caller only opts in when the cell
   *  is tall enough (`box.height >= 48`), and both boards size their lanes
   *  from `chipLanePx(longest label)`, so the common case reads in full. */
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
    ? 'ring-1 ring-inset ring-accent/30' // inset so the ring never bleeds into an abutting chip
    : late
      ? 'ring-2 ring-inset ring-status-warning'
      : tone === 'discipline'
        ? STATE_RING[state]
        : '';

  // Muted-solid active fills carry a light ink; the source square sits on a
  // translucent white so it reads on the solid. Quiet chips use the tag surface.
  const solidFill = tone === 'state' && (state === 'playing' || state === 'called') && !selected;
  const squareCls = solidFill
    ? 'bg-white/20 text-inherit'
    : 'bg-surface-chip text-muted-foreground';
  // A finished match reads muted + checked on the state-tone board —
  // NOT struck-through (strikethrough is the "cancelled" idiom; a played
  // match is a completed one).
  const doneLabel = tone === 'state' && state === 'done' && !selected;

  return (
    <button
      ref={ref}
      type="button"
      data-source={source}
      onClick={onSelect}
      className={[
        'group relative flex flex-col justify-center overflow-hidden rounded border text-left shadow-sm transition-all',
        fill,
        ring,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <span className="flex items-center gap-1 leading-tight">
        {/* Source initial square (M=meet, B=bracket) */}
        <span
          aria-hidden
          className={`inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-xs text-3xs font-semibold sw-num ${squareCls}`}
        >
          {SOURCE_INITIAL[source]}
        </span>
        <span className={`min-w-0 break-words text-2xs font-semibold sw-num${doneLabel ? ' text-muted-foreground' : ''}`}>{label}</span>
        {doneLabel ? (
          <span aria-hidden className="text-3xs text-muted-foreground">
            ✓
          </span>
        ) : null}
      </span>
      {showSides && sideA != null && sideB != null && (
        <span className="mt-0.5 break-words text-2xs leading-tight">
          {sideA} <span className="opacity-60">v</span> {sideB}
        </span>
      )}
      {children}
    </button>
  );
});
