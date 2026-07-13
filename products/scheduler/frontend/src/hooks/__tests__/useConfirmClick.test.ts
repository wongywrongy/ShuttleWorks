import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmClick } from '../useConfirmClick';

describe('useConfirmClick — the canon two-click guard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does NOT fire on the first press — it arms', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmClick(onConfirm));

    act(() => result.current.press());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.armed).toBe(true);
  });

  it('fires on the second press within the window', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmClick(onConfirm));

    act(() => result.current.press());
    act(() => result.current.press());

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(result.current.armed).toBe(false);
  });

  it('disarms itself after the window, so a stray click is harmless', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmClick(onConfirm, 4000));

    act(() => result.current.press());
    act(() => vi.advanceTimersByTime(4001));
    expect(result.current.armed).toBe(false);

    // The next press arms again rather than committing.
    act(() => result.current.press());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.armed).toBe(true);
  });

  it('reset() disarms', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmClick(onConfirm));

    act(() => result.current.press());
    act(() => result.current.reset());

    expect(result.current.armed).toBe(false);
    act(() => result.current.press());
    expect(onConfirm).not.toHaveBeenCalled(); // armed afresh, not committed
  });
});
