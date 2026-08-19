/**
 * Lifecycle badge derivation — THE precedence rule for how a workspace's
 * derived phase (signals.phase: real play state) composes with the
 * operator-managed status column:
 *
 *   archived  >  live  >  complete  >  (caller's own fallback)
 *
 * Archived outranks derivation: match rows persist forever, so a played
 * tournament keeps phase 'live'/'complete' after archiving — without this
 * rule the Hub offered "Open live day" on archived workspaces while the
 * shell header said "archived" (review finding: three consumers encoded
 * three precedence orders).
 *
 * Returns null when neither archived nor a live/complete phase applies —
 * each surface then falls back to its own resting presentation (the shell
 * shows the raw status pill; the Hub inspector shows Ready/Needs setup).
 */

export type WorkspacePhase = 'setup' | 'ready' | 'live' | 'complete';
export type WorkspaceStatus = 'draft' | 'active' | 'archived';

export interface LifecycleBadge {
  text: string;
  tone: 'green' | 'idle' | 'done';
}

export function lifecycleBadge(
  phase: WorkspacePhase | null | undefined,
  status: WorkspaceStatus | string | null | undefined,
): LifecycleBadge | null {
  if (status === 'archived') return { text: 'Archived', tone: 'idle' };
  if (phase === 'live') return { text: 'Live', tone: 'green' };
  if (phase === 'complete') return { text: 'Complete', tone: 'done' };
  return null;
}

/**
 * The CHIP variant of the badge — R-D ruling (SP-CONSOLE-3, Option A):
 * LIVE is suppressed (on a live day every surface already screams it;
 * a LIVE capsule on top is decoration), while Archived / Complete still
 * chip. One helper so the five render sites (shell header, hub row, hub
 * inspector, overview header, workspace settings) can't drift.
 *
 * Callers with a resting fallback must apply it only when
 * `lifecycleBadge` itself is null — a suppressed LIVE renders NOTHING,
 * never the fallback (the shell would otherwise say "active" mid-play).
 */
export function lifecycleChip(
  phase: WorkspacePhase | null | undefined,
  status: WorkspaceStatus | string | null | undefined,
): LifecycleBadge | null {
  const badge = lifecycleBadge(phase, status);
  return badge?.text === 'Live' ? null : badge;
}
