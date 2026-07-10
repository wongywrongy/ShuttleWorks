/**
 * Shared polling policy — one definition of "this poll can never succeed".
 *
 * A 403/404/410 on a tournament-scoped read means the workspace was
 * deleted or the caller's access was revoked; retrying on an interval
 * storms the console with the same failure forever (2026-07-09 audit
 * finding). Every polling hook (bracket, match-state sync, advisories,
 * suggestions, display sync) consults this instead of growing its own
 * status list.
 *
 * The api client's interceptor promotes the HTTP status onto the thrown
 * error as `err.status` (see api/client.ts); the raw axios shape is
 * checked as a fallback for errors that bypass the interceptor.
 */
export function isTerminalPollError(err: unknown): boolean {
  const status =
    (err as { status?: number }).status ??
    (err as { response?: { status?: number } }).response?.status;
  return status === 403 || status === 404 || status === 410;
}
