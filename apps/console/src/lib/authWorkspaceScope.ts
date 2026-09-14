const WORKSPACE_PATH = /^\/tournaments\/([0-9a-f-]{36})(?:\/|$)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Selects a node credential's route scope; it proves no identity or membership. */
export function authWorkspaceScope(pathname: string, search: string, state: unknown): string | undefined {
  const from = (state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const candidate = WORKSPACE_PATH.exec(pathname)?.[1]
    ?? new URLSearchParams(search).get('workspaceId')
    ?? (typeof from === 'string' ? WORKSPACE_PATH.exec(from)?.[1] : undefined);
  return candidate && UUID.test(candidate) ? candidate : undefined;
}
