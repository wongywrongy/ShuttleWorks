import * as React from 'react';

/**
 * Compact metric tile — the Run summary-band / dashboard stat unit.
 * @startingPoint section="Data" subtitle="Summary-band stat tile" viewport="240x90"
 */
export interface MetricTileProps {
  value?: React.ReactNode;
  label?: string;
  tone?: 'default' | 'live' | 'called' | 'accent';
  style?: React.CSSProperties;
}
export declare function MetricTile(props: MetricTileProps): JSX.Element;
