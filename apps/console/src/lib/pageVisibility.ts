/**
 * Shared Page Visibility helper.
 *
 * Several polling hooks (bracket DTO, match-state sync, suggestions,
 * advisories, live-tracking sync) need the same two primitives: "is the
 * tab hidden right now" (to skip a fetch a nobody can see) and "notify me
 * when visibility changes" (to resume promptly instead of waiting out a
 * stale interval). Centralizing both here means every poller pauses the
 * same way instead of five slightly-different `document.hidden` checks
 * drifting apart.
 *
 * `document` is absent in some non-DOM test/SSR contexts — both helpers
 * degrade safely (never hidden, subscribe is a no-op) rather than throw.
 */

/** True while the tab is hidden (backgrounded, minimized, other-tab-focused). */
export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/**
 * Subscribe to visibility changes. `cb` receives the new `hidden` state.
 * Returns an unsubscribe function. Safe to call at module scope (a
 * singleton, process-lifetime subscription) or inside a `useEffect`.
 */
export function subscribeVisibility(cb: (hidden: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => cb(document.hidden);
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
