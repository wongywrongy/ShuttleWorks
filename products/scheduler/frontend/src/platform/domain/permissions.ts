/**
 * Who may write to a workspace — the client mirror of the backend's
 * `require_tournament_access('operator')` gate.
 *
 * Interaction-audit finding A2: nothing threaded the caller's role into the
 * surfaces, so a `viewer` saw the full editing UI with every control live. Each
 * press applied optimistically, 403'd, and offered a retry that could never
 * succeed — leaving the board showing a state the server had rejected.
 *
 * The rule: a viewer's press must no-op CLIENT-SIDE and never reach the wire.
 */
import type { TournamentRole } from '../../api/dto';

/** True iff the caller may mutate this workspace.
 *
 *  Fails CLOSED on a null/unknown role — including the brief window while the
 *  summary row is still loading. Guessing "allow" there would re-open exactly
 *  the bug this fixes; the surfaces are in their loading state during that
 *  window anyway. */
export function canEdit(role: TournamentRole | null | undefined): boolean {
  return role === 'owner' || role === 'operator';
}

/** Human label for the read-only explanation. Unknown reads as the least
 *  privileged thing it could be, matching `canEdit`'s fail-closed stance. */
export function roleLabel(role: TournamentRole | null | undefined): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'operator':
      return 'Operator';
    default:
      return 'Viewer';
  }
}

/** The one sentence every read-only surface uses, so the vocabulary is uniform. */
export const READ_ONLY_MESSAGE =
  'You have view-only access to this workspace. Ask an owner for operator access to make changes.';
