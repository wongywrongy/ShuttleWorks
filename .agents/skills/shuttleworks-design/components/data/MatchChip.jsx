import React from 'react';

/**
 * MatchChip — the atom of the Run/Plan court boards ("3b" muted-solid system).
 * Active states (live/called) fill with a muted solid; quiet states (scheduled/
 * done) stay outlined. Source shown as a small M/B initial square. Optionally
 * absolutely-positioned on a court×time lane.
 */
export function MatchChip({
  code = 'MS1', players, source = 'M', state = 'scheduled',
  meta, lateBy, style = {},
}) {
  const solid = state === 'live' || state === 'called';
  const live = state === 'live';
  const fills = {
    live:   { bg: 'var(--sw-live-solid)', bd: lateBy ? 'var(--sw-called-border)' : 'var(--sw-live-border)', ink: 'var(--sw-live-ink)', sub: 'var(--sw-live-ink)' },
    called: { bg: 'var(--sw-called-solid)', bd: 'var(--sw-called-border)', ink: 'var(--sw-called-ink)', sub: 'var(--sw-called-ink)' },
    scheduled: { bg: 'var(--surface-card)', bd: 'var(--border-1)', ink: 'var(--text-3)', sub: 'var(--text-meta)' },
    done: { bg: 'var(--surface-band)', bd: 'var(--border-1)', ink: 'var(--text-muted)', sub: 'var(--text-muted)' },
  };
  const f = fills[state] || fills.scheduled;
  const initialBg = solid ? 'rgba(0,0,0,.2)' : 'var(--sw-chip-tag)';
  const initialFg = solid ? f.ink : 'var(--text-muted)';
  return (
    <div style={{
      borderRadius: 'var(--radius-md)', background: f.bg, border: `1px solid ${f.bd}`,
      padding: '0 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      gap: 2, minHeight: 40, fontFamily: 'var(--font-sans)',
      opacity: state === 'done' ? 0.62 : 1, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="sw-num" style={{
          width: 14, height: 14, borderRadius: 'var(--radius-xs)', background: initialBg,
          color: initialFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9,
        }}>{source}</span>
        <span className="sw-num" style={{ fontSize: 11, fontWeight: 600,
          color: f.ink, textDecoration: state === 'done' ? 'line-through' : 'none' }}>{code}</span>
        {live && (
          <span className="sw-num" style={{ marginLeft: 'auto', fontSize: 9, color: f.sub }}>{meta}</span>
        )}
        {lateBy && (
          <span className="sw-num" style={{ marginLeft: live ? 0 : 'auto', fontSize: 9, fontWeight: 600,
            color: 'var(--accent-ink)', background: 'var(--sw-called)', borderRadius: 3, padding: '1px 5px' }}>
            +{lateBy}
          </span>
        )}
      </div>
      {players && <span style={{ fontSize: 10, color: f.sub }}>{players}</span>}
      {state === 'called' && !players && (
        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: f.sub }}>Called</span>
      )}
    </div>
  );
}
