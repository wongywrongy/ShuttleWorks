import * as React from 'react';

/**
 * The court-board match atom ("3b" muted-solid system). Live/called fill with a
 * muted solid; scheduled/done stay outlined. Source is a small M/B initial.
 *
 * @startingPoint section="Data" subtitle="Court-board chip — live/called/scheduled/done" viewport="420x180"
 */
export interface MatchChipProps {
  /** Match/round code, e.g. "MS1", "QF1". */
  code?: string;
  /** "Chen v Webb" — shown under the code when present. */
  players?: string;
  /** Source engine initial: "M" (Meet) or "B" (Bracket). */
  source?: 'M' | 'B';
  /** Board state. Default "scheduled". */
  state?: 'scheduled' | 'called' | 'live' | 'done';
  /** Right-aligned meta for live chips, e.g. elapsed "14:32". */
  meta?: string;
  /** Over-time marker, e.g. "2" -> "+2". Tints border amber. */
  lateBy?: string | number;
  style?: React.CSSProperties;
}
export declare function MatchChip(props: MatchChipProps): JSX.Element;
