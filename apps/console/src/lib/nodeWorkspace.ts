/**
 * Where "home" is for this identity, and which workspace an event-node
 * credential should be resolved against when the URL names none.
 *
 * An event-node cookie is scoped to one workspace and the API only resolves
 * it when the request names that workspace. A bare `/` (a bookmark, the
 * not-found link, a reload) names none, so the console remembers the last
 * node workspace it saw. This is a ROUTE SELECTOR, not a credential: the
 * server still proves the cookie, membership, node id and active epoch.
 * Storage failures (private mode, blocked storage) only lose the hint.
 */
const KEY = 'sw:node-workspace';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rememberNodeWorkspace(workspaceId: string): void {
  if (!UUID.test(workspaceId)) return;
  try { window.localStorage.setItem(KEY, workspaceId); } catch { /* hint only */ }
}

export function rememberedNodeWorkspace(): string | undefined {
  try {
    const value = window.localStorage.getItem(KEY);
    return value && UUID.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The home route: a node operator's only workspace, otherwise the Hub. */
export function homePath(offlineWorkspaceId: string | null | undefined): string {
  return offlineWorkspaceId ? `/tournaments/${encodeURIComponent(offlineWorkspaceId)}` : '/';
}
