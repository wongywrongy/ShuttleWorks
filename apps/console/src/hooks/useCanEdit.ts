/**
 * `useCanEdit()` — may the current caller mutate the active workspace?
 *
 * The single client-side write gate (audit finding A2). Surfaces use it to
 * disable controls with the standard `disabled` vocabulary; the mutation seams
 * (`useTournamentState`'s blob PUT, `useLiveTracking`'s status writes) use
 * `assertCanEdit()` as a backstop so that even a control we failed to disable
 * no-ops CLIENT-SIDE instead of firing a request that 403s and leaves the board
 * showing a state the server rejected.
 */
import { useUiStore } from '../store/uiStore';
import { canEdit, READ_ONLY_MESSAGE, readOnlyRejection } from '../platform/domain/permissions';

export function useCanEdit(): boolean {
  return canEdit(useUiStore((s) => s.activeTournamentRole));
}

/**
 * Backstop for a mutation seam. Returns `false` when the caller may not write,
 * having explained why — the refusal is never silent, but it also never turns
 * into a 403 toast with a retry that cannot succeed.
 *
 * Call from a store/hook (not during render): reads the store imperatively.
 */
export function assertCanEdit(): boolean {
  const state = useUiStore.getState();
  if (canEdit(state.activeTournamentRole)) return true;
  // One toast, not one per swallowed write: the id-less toast store dedupes by
  // message, and a viewer clicking around shouldn't stack a wall of them.
  state.pushToast({
    level: 'info',
    message: 'View-only access',
    detail: READ_ONLY_MESSAGE,
    durationMs: 4000,
  });
  return false;
}

/**
 * Wrap a mutating API call so a viewer's press never reaches the wire.
 *
 * For seams whose callers need a RETURN VALUE, where `assertCanEdit()`'s
 * early-return-void shape doesn't fit. The refusal is a rejection shaped like
 * the 403 the server would have sent, so call sites behave exactly as they do
 * today against a real 403 — only now without the round trip, and with one
 * honest "view-only" toast instead of a retry that could never succeed.
 *
 * The check runs at CALL time, not at wrap time, so it always sees the current
 * role (these wrappers are built once in a provider's `useMemo`).
 */
export function guardMutation<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A) => (assertCanEdit() ? fn(...args) : readOnlyRejection());
}
