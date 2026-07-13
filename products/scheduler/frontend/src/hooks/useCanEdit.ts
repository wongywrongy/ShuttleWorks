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
import { canEdit, READ_ONLY_MESSAGE } from '../platform/domain/permissions';

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
