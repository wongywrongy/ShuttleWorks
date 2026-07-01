import React from 'react';

/**
 * Status pill — squared, mono, with a leading square swatch.
 * READY / LIVE / DRAWN / CALLED / SCHED etc. Optional pulse for live.
 */
export function StatusPill({ status = 'ready', pulse, children, style = {} }) {
  const map = {
    ready:  { c: 'var(--status-live)', label: 'Ready' },
    live:   { c: 'var(--status-live)', label: 'Live', pulse: true },
    called: { c: 'var(--status-called)', label: 'Called' },
    drawn:  { c: 'var(--sw-scheduled)', label: 'Drawn' },
    sched:  { c: 'var(--text-meta)', label: 'Scheduled' },
    draft:  { c: 'var(--text-meta)', label: 'Draft' },
  };
  const s = map[status] || map.ready;
  const doPulse = pulse ?? s.pulse;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      border: `1px solid color-mix(in srgb, ${s.c} 30%, transparent)`,
      background: `color-mix(in srgb, ${s.c} 10%, transparent)`,
      borderRadius: 'var(--radius-sm)', padding: '2px 8px',
      fontFamily: 'var(--font-sans)', ...style,
    }}>
      <span className={doPulse ? 'sw-pulse' : ''} style={{
        width: 5, height: 5, borderRadius: 9999, background: s.c,
        boxShadow: doPulse ? `0 0 8px ${s.c}` : 'none',
      }} />
      <span className="sw-num" style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.04em', color: s.c,
      }}>{children || s.label}</span>
    </span>
  );
}
