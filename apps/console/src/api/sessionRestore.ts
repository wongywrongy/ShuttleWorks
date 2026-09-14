/**
 * Resumable fresh proof. A sensitive request answered with
 * ``AUTH_REAUTH_REQUIRED`` has already raised the session lock (the response
 * interceptor dispatches ``sw:reauth-required``). ``withFreshProof`` waits for
 * that lock to clear and retries the request ONCE, so an export or a link
 * change started on a stale session completes after the operator verifies,
 * instead of being silently dropped.
 *
 * Deliberately explicit per call site, never a global 401 retry: replaying an
 * arbitrary non-idempotent write after an arbitrary 401 is not safe.
 */
export const FRESH_PROOF_CANCELLED = 'AUTH_REAUTH_CANCELLED';

type TaggedError = Error & { code?: string; __handled?: boolean };

function cancelled(): TaggedError {
  const error: TaggedError = new Error('Verification was cancelled; nothing was changed.');
  error.code = FRESH_PROOF_CANCELLED;
  // The operator chose this; the unhandled-rejection guard must not toast it.
  error.__handled = true;
  return error;
}

export function isFreshProofCancelled(error: unknown): boolean {
  return (error as TaggedError | null)?.code === FRESH_PROOF_CANCELLED;
}

function needsFreshProof(error: unknown): boolean {
  return (error as TaggedError | null)?.code === 'AUTH_REAUTH_REQUIRED';
}

/** Resolves after a successful re-verification; rejects when the operator
 *  cancels it or the session ends while the lock is up. */
export function waitForSessionRestore(): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('sw:session-restored', restored);
      window.removeEventListener('sw:reauth-cancelled', stop);
      window.removeEventListener('sw:session-expired', stop);
    };
    const restored = () => { cleanup(); resolve(); };
    const stop = () => { cleanup(); reject(cancelled()); };
    window.addEventListener('sw:session-restored', restored);
    window.addEventListener('sw:reauth-cancelled', stop);
    window.addEventListener('sw:session-expired', stop);
  });
}

export async function withFreshProof<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!needsFreshProof(error)) throw error;
    await waitForSessionRestore();
    return run();
  }
}
