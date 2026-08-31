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
import { GearSix, SignOut } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { SwMonogram } from '../components/ShuttleWorksMark';
import { ActiveChoice } from '../components/ActiveChoice';

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut, isBootstrap, authMode } = useAuth();
  const onSettings = location.pathname === '/settings';
  const onHub = location.pathname === '/';
  // Prefer the display name; fall back to email; 'L' for the local bootstrap.
  const identity = user?.displayName?.trim() || user?.email || 'Local';
  const initial = identity.trim().charAt(0).toUpperCase() || 'L';
  // The local bootstrap identity has no session to end — signing out would
  // just re-probe back into the same identity, so hide the affordance.
  const showSignOut = !(isBootstrap && authMode === 'local');

  return (
    <nav
      aria-label="Global"
      className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/40 py-3"
    >
      {/* The brand monogram remains the go-home affordance; the target wrapper,
          not the mark itself, owns the shared selected treatment. */}
      <ActiveChoice
        to="/"
        active={onHub}
        geometry="row"
        semantics="page"
        title="Home"
        aria-label="Home"
        className="flex h-10 w-10 items-center justify-center p-0"
      >
        <SwMonogram />
      </ActiveChoice>

      <div className="mt-2 flex flex-1 flex-col items-center gap-1">
        <ActiveChoice
          to="/settings"
          active={onSettings}
          geometry="row"
          semantics="page"
          title="Account"
          aria-label="Account"
          data-testid="global-settings-link"
          className="flex h-10 w-10 items-center justify-center p-0"
        >
          <GearSix className="h-5 w-5" aria-hidden />
        </ActiveChoice>
      </div>

      {/* Who you are signed in as. The gear above is the Account surface's nav
          item and owns the word "Account"; this chip names the person, which
          is the fact it actually carries and the only thing that tells the two
          /settings links apart in a screen reader. */}
      <Link
        to="/settings?section=profile"
        title={identity}
        aria-label={identity}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-2xs font-semibold text-muted-foreground hover:text-foreground"
      >
        {initial}
      </Link>
      {showSignOut ? (
        <button
          type="button"
          title="Sign out"
          aria-label="Sign out"
          data-testid="sidebar-sign-out"
          onClick={() => void signOut()}
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SignOut className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </nav>
  );
}
