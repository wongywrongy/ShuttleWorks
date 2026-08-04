import React from 'react';

/** Small health/status dot. Optional glow + pulse for live signals. */
export function HealthDot({ tone = 'live', pulse = false, size = 7, style = {} }) {
  const tones = {
    live: 'var(--status-live)', called: 'var(--status-called)',
    idle: 'var(--text-muted)', accent: 'var(--accent)',
    scheduled: 'var(--sw-scheduled)', bracket: 'var(--sw-bracket)',
  };
  const c = tones[tone] || tones.live;
  return (
    <span className={pulse ? 'sw-pulse' : ''} style={{
      width: size, height: size, borderRadius: 9999, background: c,
      boxShadow: pulse ? `0 0 8px ${c}` : 'none', flexShrink: 0, ...style,
    }} />
  );
}
