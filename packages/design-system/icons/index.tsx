import type { SVGProps, ReactNode } from 'react';

/* ============================================================================
 * @scheduler/design-system/icons — custom domain icon set
 *
 * 15 inline-SVG React components on a 24×24 grid in technical-drawing style.
 * Per BRAND.md §9: 1.75px stroke (regular) / 2.5px (bold), square caps +
 * miter joins, inherits currentColor, no hardcoded color in icons.
 *
 * API mirrors @phosphor-icons/react so call-sites are swap-compatible:
 *   <IconCourt size={16} weight="regular" />
 *   <IconLive size="1em" weight="bold" className="text-status-live" />
 *
 * Phosphor stays as the secondary set for generic UI affordances
 * (chevrons, close, drag-handle). This set carries domain personality.
 * ========================================================================= */

export type IconWeight = 'regular' | 'bold';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Size in CSS units. Defaults to `1em` so the icon scales with surrounding text. */
  size?: number | string;
  /** Stroke weight. `regular` = 1.75px, `bold` = 2.5px. */
  weight?: IconWeight;
}

const STROKE: Record<IconWeight, number> = {
  regular: 1.75,
  bold:    2.5,
};

/**
 * Base SVG wrapper. Each domain icon below is a thin client of this.
 * Renders square caps + miter joins for the technical/blueprint feel.
 */
function Glyph({
  size = '1em',
  weight = 'regular',
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE[weight]}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ===== Domain ===== */

/** Badminton court — outer rectangle, net (horizontal), center service line. */
export function IconCourt(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="5" width="18" height="14" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="12" y1="5" x2="12" y2="19" />
    </Glyph>
  );
}

/** Racket — circular head + diagonal handle. */
export function IconRacket(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="9" cy="9" r="5.5" />
      <line x1="12.9" y1="12.9" x2="20" y2="20" />
    </Glyph>
  );
}

/** Shuttlecock — cork nose + flared skirt with ridge. */
export function IconShuttle(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="6" r="2.5" />
      <line x1="9.6" y1="8" x2="6.5" y2="20" />
      <line x1="14.4" y1="8" x2="17.5" y2="20" />
      <line x1="6.5" y1="20" x2="17.5" y2="20" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </Glyph>
  );
}

/** Tournament bracket — 4-entry single-elim feed pattern. */
export function IconBracket(props: IconProps) {
  return (
    <Glyph {...props}>
      <line x1="2"  y1="5"  x2="6"  y2="5"  />
      <line x1="2"  y1="9"  x2="6"  y2="9"  />
      <line x1="2"  y1="15" x2="6"  y2="15" />
      <line x1="2"  y1="19" x2="6"  y2="19" />
      <line x1="6"  y1="5"  x2="6"  y2="9"  />
      <line x1="6"  y1="15" x2="6"  y2="19" />
      <line x1="6"  y1="7"  x2="11" y2="7"  />
      <line x1="6"  y1="17" x2="11" y2="17" />
      <line x1="11" y1="7"  x2="11" y2="17" />
      <line x1="11" y1="12" x2="22" y2="12" />
    </Glyph>
  );
}

/** Draw — die face with four pips, the "random seed" of the bracket. */
export function IconDraw(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="4" width="16" height="16" />
      <circle cx="9"  cy="9"  r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9"  r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9"  cy="15" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/* ===== State ===== */

/** Live — concentric ring + filled core. Pairs with --status-live. */
export function IconLive(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Called — megaphone with one sound wave. Pairs with --status-called. */
export function IconCalled(props: IconProps) {
  return (
    <Glyph {...props}>
      <polygon points="3,10 3,14 14,18 14,6" />
      <line x1="14" y1="9" x2="14" y2="15" />
      <path d="M17 9 C 19 11, 19 13, 17 15" />
    </Glyph>
  );
}

/** Started — play triangle. Pairs with --status-started. */
export function IconStarted(props: IconProps) {
  return (
    <Glyph {...props}>
      <polygon points="6,4 6,20 20,12" />
    </Glyph>
  );
}

/** Blocked — X within a circle. Hard rule conflict. */
export function IconBlocked(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="7"  y1="7"  x2="17" y2="17" />
      <line x1="17" y1="7"  x2="7"  y2="17" />
    </Glyph>
  );
}

/** Idle — two vertical bars (pause). Scheduled but inactive. */
export function IconIdle(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="6"  y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </Glyph>
  );
}

/** Done — square-corner checkmark on the technical grid. */
export function IconDone(props: IconProps) {
  return (
    <Glyph {...props}>
      <polyline points="3,12 9,18 21,5" />
    </Glyph>
  );
}

/* ===== Operator / system signal ===== */

/** Advisory — soft warning. Triangle with stem + dot. */
export function IconAdvisory(props: IconProps) {
  return (
    <Glyph {...props}>
      <polygon points="12,3 22,21 2,21" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Disruption — lightning bolt / broken signal. Hard interruption. */
export function IconDisruption(props: IconProps) {
  return (
    <Glyph {...props}>
      <polyline points="13,2 4,13 11,13 9,22 20,10 13,10 15,2" />
    </Glyph>
  );
}

/** Solver thinking — telemetry waveform. Live solver objective movement. */
export function IconSolverThinking(props: IconProps) {
  return (
    <Glyph {...props}>
      <polyline points="2,12 6,12 8,8 12,16 14,10 18,14 20,12 22,12" />
    </Glyph>
  );
}

/** Apply — accept a proposal. Right-angle arrow into a square (commit). */
export function IconApply(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="11" y="4" width="9" height="16" />
      <line x1="3"  y1="12" x2="11" y2="12" />
      <polyline points="7,8 11,12 7,16" />
    </Glyph>
  );
}

/* ===== Re-export the base wrapper for advanced/custom uses ===== */
export { Glyph as IconGlyph };
