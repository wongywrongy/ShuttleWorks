import React from 'react';

/**
 * WorkspaceSidebar — the module-grouped nav rail. Modules (Meet/Bracket/
 * Operations/Display) are collapsible groups tagged by role (ENG/SHR/OUT);
 * the open module reveals its shared sub-pages (Roster/Matches/Configuration…).
 * A "Workspace" section holds cross-cutting settings.
 */
export function WorkspaceSidebar({ modules = [], workspaceLinks = [], style = {} }) {
  return (
    <nav style={{
      width: 'var(--sidebar-w)', flexShrink: 0, borderRight: '1px solid var(--border-1)',
      background: 'var(--surface-rail)', padding: 10, overflow: 'hidden',
      fontFamily: 'var(--font-sans)', ...style,
    }}>
      <div style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-meta)' }}>Overview</div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {modules.map((m) => (
          <div key={m.name}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-faint, var(--text-meta))' }}>{m.name}</span>
                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', borderRadius: 'var(--radius-xs)', padding: '0 4px',
                  color: m.open ? 'var(--accent)' : 'var(--text-meta)',
                  border: `1px solid ${m.open ? 'var(--accent-border)' : 'var(--border-control)'}` }}>{m.role}</span>
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-meta)', transform: m.open ? 'rotate(90deg)' : 'none' }}>›</span>
            </div>
            {m.open && m.pages && (
              <div style={{ marginLeft: 12, borderLeft: '1px solid var(--border-1)', paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {m.pages.map((p) => {
                  const active = p === m.active;
                  return (
                    <div key={p} style={{
                      position: 'relative', borderRadius: 'var(--radius-md)', padding: '6px 12px', fontSize: 12,
                      fontWeight: active ? 500 : 400, color: active ? 'var(--text-1)' : 'var(--text-meta)',
                      background: active ? 'var(--surface-active)' : 'transparent',
                    }}>
                      {active && <span style={{ position: 'absolute', left: -9, top: 6, bottom: 6, width: 2, borderRadius: 2, background: 'var(--accent)' }} />}
                      {p}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {workspaceLinks.length > 0 && (
        <>
          <div style={{ margin: '10px 0', borderTop: '1px solid var(--border-1)' }} />
          <div style={{ padding: '0 12px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-meta)' }}>Workspace</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {workspaceLinks.map((l) => (
              <div key={l} style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-meta)' }}>{l}</div>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
