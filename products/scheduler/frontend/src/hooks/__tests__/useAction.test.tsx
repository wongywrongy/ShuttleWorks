/**
 * Interaction-audit finding C1: mutating actions double-submitted on a rapid
 * second press — two `POST /state/backup`, two `POST /plan-finalized`, two
 * solves. Note that some of them ALREADY had a `busy` state flag: a React state
 * update does not apply until the next render, so a second click in the same
 * tick sails straight past `disabled={busy}`. Only a synchronous ref closes
 * that window.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAction } from '../useAction';
import { useUiStore } from '../../store/uiStore';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('useAction — one in-flight run at a time', () => {
  it('ignores a second press fired in the SAME tick as the first', async () => {
    const d = deferred();
    const fn = vi.fn(() => d.promise);
    const { result } = renderHook(() => useAction(fn));

    // Both calls happen before React can re-render with `pending: true` — the
    // exact race a `disabled={busy}` state flag cannot catch.
    await act(async () => {
      void result.current.run();
      void result.current.run();
    });

    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve();
      await d.promise;
    });
  });

  it('exposes `pending` for the disabled vocabulary', async () => {
    const d = deferred();
    const { result } = renderHook(() => useAction(() => d.promise));

    expect(result.current.pending).toBe(false);
    await act(async () => {
      void result.current.run();
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(result.current.pending).toBe(false);
  });

  it('allows a NEW run once the first settles', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAction(fn));

    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      await result.current.run();
    });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('releases the lock when the action fails, so the button is not stuck', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAction(fn));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.pending).toBe(false);
    await act(async () => {
      await result.current.run();
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never rethrows — a `void run()` in an onClick must not become an unhandled rejection', async () => {
    // Audit finding B1: mutating handlers with no catch produced genuine
    // `unhandledrejection` events. The wrapper owns the failure path.
    useUiStore.setState({ toasts: [] });
    const { result } = renderHook(() =>
      useAction(() => Promise.reject(new Error('server said no'))),
    );

    await act(async () => {
      await expect(result.current.run()).resolves.toBeUndefined();
    });

    // ...and it is NOT swallowed: the failure is visible.
    const toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].level).toBe('error');
    expect(toasts[0].detail).toBe('server said no');
  });

  it('routes the failure to onError when the caller wants an inline error', async () => {
    const onError = vi.fn();
    useUiStore.setState({ toasts: [] });
    const { result } = renderHook(() =>
      useAction(() => Promise.reject(new Error('nope')), { onError }),
    );

    await act(async () => {
      await result.current.run();
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(useUiStore.getState().toasts).toHaveLength(0); // no double-surfacing
  });

  it('does not set state after unmount (dialog closed mid-action)', async () => {
    const d = deferred();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useAction(() => d.promise));

    await act(async () => {
      void result.current.run();
    });
    unmount();
    await act(async () => {
      d.resolve();
      await d.promise;
    });

    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
