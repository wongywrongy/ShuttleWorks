import * as React from 'react';

/**
 * ShuttleWorks button. Primary action carries the blue glow; secondary is a
 * bordered raised surface; ghost is chromeless.
 *
 * @startingPoint section="Core" subtitle="Primary / secondary / ghost, 3 sizes" viewport="360x120"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Default "primary". */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Control height. Default "md". */
  size?: 'sm' | 'md' | 'lg';
  /** Toggle the primary glow. Default true. */
  glow?: boolean;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
