/**
 * Shared boilerplate for async hook actions.
 *
 * Most fetch / solve / commit hooks (`useProposals`, `useSchedule`,
 * etc.) follow the same shape: track an `idle | loading | error`
 * status, capture the last error, and surface failures via a toast.
 * The boilerplate around every individual call gets repetitive and
 * tends to drift — one hook decides errors are sticky toasts, another
 * chooses 5-second auto-dismiss, a third forgets the toast entirely.
 *
 * `useAsyncAction` centralises that contract:
 *
 *   const { status, error, run } = useAsyncAction();
 *   const result = await run(() => apiClient.commitProposal(id), {
 *     errorTitle: 'Commit failed',
 *   });
 *
 * The wrapped `run`:
 *   - sets status to 'loading' before invoking
 *   - resolves with whatever the inner promise resolved with, or
 *     `null` on failure (so callers can use `if (!result) return`)
 *   - converts thrown errors to toast + state, never rethrows
 *
 * Sticky errors (errorDuration: null) are the default for failures
 * because operators need to read them; pass `errorDuration: 5000`
 * for the noisy-but-benign case (debounced retries, etc.).
 */
import { useCallback, useState } from 'react';

import { useAppStore } from '../store/appStore';

export type AsyncStatus = 'idle' | 'loading' | 'error';

export interface RunOptions {
  /** Title used for the failure toast. Defaults to "Action failed". */
  errorTitle?: string;
  /** Override the toast lifetime. ``null`` keeps it until dismissed. */
  errorDuration?: number | null;
  /** When true, swallow the error silently instead of pushing a toast.
   *  Useful for cancellable polls where a network blip isn't operator-
   *  facing. The error still lands in `state.error` for inspection. */
  silent?: boolean;
}

export interface UseAsyncAction {
  status: AsyncStatus;
  error: string | null;
  /** Run a thunk under the shared lifecycle. Resolves with the inner
   *  return value on success, or ``null`` on failure. */
  run: <T>(fn: () => Promise<T>, options?: RunOptions) => Promise<T | null>;
  /** Reset the hook to idle without running anything (e.g., after a
   *  modal closes). */
  reset: () => void;
}

export function useAsyncAction(): UseAsyncAction {
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const pushToast = useAppStore((s) => s.pushToast);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, options: RunOptions = {}): Promise<T | null> => {
      const { errorTitle = 'Action failed', errorDuration = null, silent = false } = options;
      setStatus('loading');
      setError(null);
      try {
        const result = await fn();
        setStatus('idle');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus('error');
        if (!silent) {
          pushToast({
            level: 'error',
            message: errorTitle,
            detail: message,
            durationMs: errorDuration,
          });
        }
        return null;
      }
    },
    [pushToast],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, run, reset };
}
