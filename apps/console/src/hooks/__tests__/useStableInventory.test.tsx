import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStableInventory } from '../useStableInventory';

interface Row {
  id: string;
  value: string;
}

const rowId = (row: Row) => row.id;

describe('useStableInventory', () => {
  it('adopts the first complete local dataset after an empty initial load', () => {
    const { result, rerender } = renderHook(
      ({ matching, all }: { matching: Row[]; all: Row[] }) =>
        useStableInventory(matching, all, rowId, 'page:1'),
      { initialProps: { matching: [] as Row[], all: [] as Row[] } },
    );
    expect(result.current.rows).toEqual([]);
    rerender({
      matching: [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }],
      all: [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }],
    });
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result.current.pending).toBe(false);
  });

  it('keeps row order stable while applying live value updates', () => {
    const initial: Row[] = [
      { id: 'a', value: 'A1' },
      { id: 'b', value: 'B1' },
    ];
    const { result, rerender } = renderHook(
      ({ matching, all, scope }: { matching: Row[]; all: Row[]; scope: string }) =>
        useStableInventory(matching, all, rowId, scope),
      { initialProps: { matching: initial, all: initial, scope: 'page:1' } },
    );
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b']);

    rerender({
      matching: [{ id: 'b', value: 'B2' }, { id: 'a', value: 'A2' }],
      all: [{ id: 'a', value: 'A2' }, { id: 'b', value: 'B2' }],
      scope: 'page:1',
    });
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result.current.rows.map((row) => row.value)).toEqual(['A2', 'B2']);
    expect(result.current.pending).toBe(true);

    act(() => result.current.refresh());
    expect(result.current.rows.map((row) => row.id)).toEqual(['b', 'a']);
    expect(result.current.pending).toBe(false);
  });

  it('removes deleted rows immediately and resets order for a changed filter scope', () => {
    const initial: Row[] = [
      { id: 'a', value: 'A' },
      { id: 'b', value: 'B' },
    ];
    const { result, rerender } = renderHook(
      ({ matching, all, scope }: { matching: Row[]; all: Row[]; scope: string }) =>
        useStableInventory(matching, all, rowId, scope),
      { initialProps: { matching: initial, all: initial, scope: 'filter:all' } },
    );

    rerender({
      matching: [{ id: 'b', value: 'B' }],
      all: [{ id: 'b', value: 'B' }],
      scope: 'filter:all',
    });
    expect(result.current.rows.map((row) => row.id)).toEqual(['b']);
    expect(result.current.pending).toBe(false);

    rerender({
      matching: [{ id: 'a', value: 'A filtered' }],
      all: [{ id: 'a', value: 'A filtered' }, { id: 'b', value: 'B' }],
      scope: 'filter:a',
    });
    expect(result.current.rows.map((row) => row.id)).toEqual(['a']);
    expect(result.current.rows[0].value).toBe('A filtered');
    expect(result.current.pending).toBe(false);
  });
  it('adopts a locally added row immediately, appended in inventory order', () => {
    const initial: Row[] = [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }];
    const { result, rerender } = renderHook(
      ({ matching, all }: { matching: Row[]; all: Row[] }) =>
        useStableInventory(matching, all, rowId, 'page:1'),
      { initialProps: { matching: initial, all: initial } },
    );

    const added: Row[] = [{ id: 'a', value: 'A' }, { id: 'c', value: 'C' }, { id: 'b', value: 'B' }];
    rerender({ matching: added, all: added });
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('re-seeds when a wholesale regeneration replaces every id', () => {
    const initial: Row[] = [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }];
    const { result, rerender } = renderHook(
      ({ matching, all }: { matching: Row[]; all: Row[] }) =>
        useStableInventory(matching, all, rowId, 'page:1'),
      { initialProps: { matching: initial, all: initial } },
    );

    const regenerated: Row[] = [{ id: 'x', value: 'X' }, { id: 'y', value: 'Y' }];
    rerender({ matching: regenerated, all: regenerated });
    expect(result.current.rows.map((row) => row.id)).toEqual(['x', 'y']);
    expect(result.current.pending).toBe(false);
  });

  it('keeps the snapshot order when the same ids are reordered', () => {
    const initial: Row[] = [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }];
    const { result, rerender } = renderHook(
      ({ matching, all }: { matching: Row[]; all: Row[] }) =>
        useStableInventory(matching, all, rowId, 'page:1'),
      { initialProps: { matching: initial, all: initial } },
    );

    const reordered: Row[] = [{ id: 'b', value: 'B' }, { id: 'a', value: 'A' }];
    rerender({ matching: reordered, all: reordered });
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result.current.pending).toBe(true);
  });
});
