/** Leaving an identity clears in-memory private stores and mounted drafts. */
export function leaveAuthenticatedView(workspaceId?: string): void {
  window.location.replace(workspaceId ? `/login?workspaceId=${encodeURIComponent(workspaceId)}&node=1` : '/login');
}
