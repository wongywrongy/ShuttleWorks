/**
 * `useAction` — the shared in-flight guard for a mutating action.
 *
 * Interaction-audit finding C1: a rapid double-press double-submitted several
 * mutations (two backups, two plan-finalize POSTs, two solves). Some of those
 * buttons already had a `busy` state flag — and still double-fired, because a
 * React state update does not apply until the next render, so the second click
 * in the same tick sails right past `disabled={busy}`.
 *
 * The lock is therefore a REF (synchronous, effective immediately), and
 * `pending` is the state companion that drives the `disabled` vocabulary. One
 * wrapper means double-fire dies everywhere at once instead of per-button
 * ad-hoc flags.
 *
 * Pass a stable `fn` (a `useCallback`), or `run` changes identity every render.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';

export interface Action<TArgs extends unknown[]> {
  /** Runs `fn` unless a run is already in flight, in which case it no-ops. */
  run: (...args: TArgs) => Promise<void>;
  /** True while a run is in flight — feed this to `disabled` / `aria-busy`. */
  pending: boolean;
}

export interface ActionOptions {
  /** Handle the failure yourself (e.g. an inline error). When omitted, the
   *  failure surfaces as an error toast. */
  onError?: (err: unknown) => void;
  /** Headline for the default error toast. */
  errorMessage?: string;
}

export function useAction<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<unknown> | unknown,
  options?: ActionOptions,
): Action<TArgs> {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  // A dialog can be dismissed while its action is still in flight; don't set
  // state on the unmounted component when it lands.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Keep the latest options without making `run` change identity every render.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const run = useCallback(
    async (...args: TArgs) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      try {
        await fn(...args);
      } catch (err) {
        // `run` never rethrows. Callers fire it from an onClick (`void run()`),
        // so a rethrow would become an unhandled promise rejection — which is
        // audit finding B1. It is not swallowed either: every mutating action
        // gets a visible failure path, here or via `onError`.
        const handler = optionsRef.current?.onError;
        if (handler) {
          handler(err);
        } else if (!(err as { __handled?: boolean })?.__handled) {
          // `__handled` is the api-client's marker for an error it has already
          // surfaced (see client.ts). Respect it, or the operator sees the same
          // failure twice.
          useUiStore.getState().pushToast({
            level: 'error',
            message: optionsRef.current?.errorMessage ?? "That didn't work",
            detail: err instanceof Error ? err.message : String(err),
            durationMs: 6000,
          });
        }
      } finally {
        // Always release, including on failure — otherwise a failed action
        // leaves the button permanently disabled (a stuck-pending state).
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [fn],
  );

  return { run, pending };
}
