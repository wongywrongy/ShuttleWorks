import React from 'react';

/** Compact metric tile — the summary-band unit on Run and dashboards. */
export function MetricTile({ value, label, tone = 'default', style = {} }) {
  const tones = {
    default: { v: 'var(--text-1)', bd: 'var(--border-1)' },
    live: { v: 'var(--status-live)', bd: 'color-mix(in srgb, var(--status-live) 25%, transparent)' },
    called: { v: 'var(--status-called)', bd: 'color-mix(in srgb, var(--status-called) 30%, transparent)' },
    accent: { v: 'var(--accent)', bd: 'var(--accent-border)' },
  };
  const t = tones[tone] || tones.default;
  return (
    <div style={{
      flex: 1, border: `1px solid ${t.bd}`, borderRadius: 'var(--radius-xl)',
      background: 'var(--surface-card)', padding: '11px 14px', fontFamily: 'var(--font-sans)', ...style,
    }}>
      <div className="sw-num" style={{ fontSize: 18, fontWeight: 700, color: t.v }}>{value}</div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
