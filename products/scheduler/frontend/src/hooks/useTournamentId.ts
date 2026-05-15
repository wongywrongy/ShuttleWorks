/**
 * URL-derived tournament id helper.
 *
 * Step 2 wraps the operator app at ``/tournaments/:id/*``. Every hook
 * that talks to the api client needs the current tournament id; this
 * hook reads it from the URL params via React Router. Components and
 * hooks outside a tournament route will see ``undefined``; the caller
 * decides whether to throw, redirect, or no-op.
 *
 * The non-throwing variant (``useTournamentIdOrNull``) is for code
 * paths that may run on the public display or the tournament-list page,
 * where no tournament is selected. The default ``useTournamentId``
 * throws so a developer mistake (using it outside the tournament
 * route) is loud rather than silently wrong.
 */
import { useParams } from 'react-router-dom';

export function useTournamentIdOrNull(): string | null {
  const params = useParams<{ id?: string }>();
  return params.id ?? null;
}

export function useTournamentId(): string {
  const id = useTournamentIdOrNull();
  if (!id) {
    throw new Error(
      'useTournamentId() called outside a /tournaments/:id route',
    );
  }
  return id;
}
