import * as React from 'react';

/**
 * Workspace/match status pill: leading square swatch + uppercase mono label,
 * tinted by status. Live variants breathe.
 *
 * @startingPoint section="Feedback" subtitle="Ready / Live / Called / Drawn" viewport="360x80"
 */
export interface StatusPillProps {
  /** Semantic status. Default "ready". */
  status?: 'ready' | 'live' | 'called' | 'drawn' | 'sched' | 'draft';
  /** Force the breathing pulse (auto-on for live). */
  pulse?: boolean;
  /** Override the label text. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function StatusPill(props: StatusPillProps): JSX.Element;
