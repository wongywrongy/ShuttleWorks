import * as React from 'react';

/**
 * Compact tabular-figure code chip — match/round codes, seeds, ranks.
 * The lightweight replacement for filled status pills in tables.
 *
 * @startingPoint section="Data" subtitle="Mono code chips: MS1, QF1, SEED 1" viewport="320x80"
 */
export interface TagProps {
  /** Color intent. Default "accent". */
  tone?: 'accent' | 'plain' | 'bracket';
  /** Dashed outline, no fill — for empty/unseeded states. */
  dashed?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Tag(props: TagProps): JSX.Element;
