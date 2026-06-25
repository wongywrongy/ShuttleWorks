/**
 * AppSidebar — the persistent, icon-only global navigation rail. Present on
 * every authenticated surface (Hub, New Workspace, global Settings, and inside
 * a workspace). It is the unambiguous home for *global* concerns:
 *   - the brand mark / home (→ Hub)
 *   - global settings (appearance, account, integrations — NOT per-workspace)
 *   - the signed-in account
 *
 * Per-workspace settings live inside the workspace; this rail never carries them.
 */
import { Link, useLocation } from 'react-router-dom';
import { GearSix, House } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

function railItemClass(active: boolean): string {
  return [
    'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
    active
      ? 'bg-accent/10 text-accent'
      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
  ].join(' ');
}

export function AppSidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const onSettings = location.pathname === '/settings';
  const onHub = location.pathname === '/';
  const initial = (user?.email ?? 'L').trim().charAt(0).toUpperCase() || 'L';

  return (
    <nav
      aria-label="Global"
      className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/40 py-3"
    >
      {/* Home */}
      <Link
        to="/"
        title="Home"
        aria-label="Home"
        aria-current={onHub ? 'page' : undefined}
        className={railItemClass(onHub)}
      >
        <House className="h-5 w-5" weight={onHub ? 'fill' : 'regular'} aria-hidden />
      </Link>

      <div className="mt-2 flex flex-1 flex-col items-center gap-1">
        <Link
          to="/settings"
          title="Settings"
          aria-label="Global settings"
          aria-current={onSettings ? 'page' : undefined}
          data-testid="global-settings-link"
          className={railItemClass(onSettings)}
        >
          <GearSix className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      {/* Account */}
      <Link
        to="/settings?section=profile"
        title={user?.email ?? 'Account'}
        aria-label="Account"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-2xs font-semibold text-muted-foreground hover:text-foreground"
      >
        {initial}
      </Link>
    </nav>
  );
}
