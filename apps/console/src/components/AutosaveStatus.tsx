/**
 * AutosaveStatus — the visible state of the roster's DEBOUNCED autosave.
 *
 * D4 (O5) keeps autosave for the isolated availability/notes edits, but only
 * on the condition that its Saving/Saved/Failed state is actually visible.
 * The global `UnsavedBanner` appears after thirty seconds of dirt or on a hard
 * error; that is a backstop, not feedback, so a panel editing those fields
 * shows the same store state inline and immediately.
 *
 * It reads `uiStore.persistStatus` — the one autosave state the roster write
 * path already sets — and adds no synchronization of its own.
 */
import { useUiStore } from '../store/uiStore';

const WORDING = {
  dirty: 'Unsaved',
  saving: 'Saving\u2026',
  error: 'Save failed',
  idle: 'Saved',
} as const;

export function AutosaveStatus({ testId = 'autosave-status' }: { testId?: string }) {
  const status = useUiStore((s) => s.persistStatus);
  const failed = status === 'error';
  return (
    <span
      role="status"
      data-testid={testId}
      className={`text-2xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
    >
      {WORDING[status]}
    </span>
  );
}
