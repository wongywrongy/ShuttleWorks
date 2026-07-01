import React from 'react';

/**
 * ShuttleWorks primary/secondary/ghost button.
 * Primary carries the signature blue glow.
 */
export function Button({ variant = 'primary', size = 'md', glow = true, children, style = {}, ...rest }) {
  const sizes = {
    sm: { height: 30, padding: '0 13px', fontSize: 12 },
    md: { height: 38, padding: '0 16px', fontSize: 13 },
    lg: { height: 44, padding: '0 22px', fontSize: 14 },
  };
  const variants = {
    primary: {
      background: 'var(--accent)',
      color: 'var(--accent-ink)',
      border: 'none',
      boxShadow: glow ? 'var(--glow-accent)' : 'none',
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-2)',
      border: '1px solid var(--border-control)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-meta)',
      border: 'none',
    },
  };
  return (
    <button
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 'var(--radius-lg)', fontFamily: 'var(--font-sans)', fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'filter var(--dur) var(--ease)',
        ...sizes[size], ...variants[variant], ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
