import * as React from 'react';

/** A small colored status dot; can glow + pulse for live signals. */
export interface HealthDotProps {
  tone?: 'live' | 'called' | 'idle' | 'accent' | 'scheduled' | 'bracket';
  /** Breathe + glow. Use for live-only. */
  pulse?: boolean;
  /** Diameter in px. Default 7. */
  size?: number;
  style?: React.CSSProperties;
}
export declare function HealthDot(props: HealthDotProps): JSX.Element;
