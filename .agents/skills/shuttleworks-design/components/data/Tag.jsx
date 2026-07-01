import React from 'react';

/**
 * Compact mono-tabular code chip: match codes (MS1, WD2), round codes (QF1),
 * seed labels, event ranks. Replaces heavy pills — quiet by default.
 */
export function Tag({ tone = 'accent', dashed = false, children, style = {} }) {
  const tones = {
    accent: { color: 'var(--accent)', background: 'var(--accent-tint)' },
    plain: { color: 'var(--accent)', background: 'transparent' },
    muted: { color: 'var(--text-muted)', background: 'transparent',
             border: '1px dashed var(--border-control)' },
    bracket: { color: 'var(--sw-bracket)', background: 'rgba(167,139,250,.14)' },
  };
  return (
    <span className="sw-num" style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 600, padding: dashed ? '0 5px' : '2px 7px',
      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)',
      ...(dashed ? tones.muted : tones[tone]), ...style,
    }}>
      {children}
    </span>
  );
}
