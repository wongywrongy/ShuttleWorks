import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useInventoryPage } from '../useInventoryPage';

interface Row { id: string; value: string }

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/matches?meet-matches.page=2']}>
    {children}
  </MemoryRouter>
);

describe('useInventoryPage', () => {
  it('preserves a deep-linked page while the local inventory loads', async () => {
    const { result, rerender } = renderHook(
      ({ rows, allRows, ready }: { rows: Row[]; allRows: Row[]; ready: boolean }) =>
        useInventoryPage(rows, allRows, (row) => row.id, 'meet-matches', 'all', ready),
      { initialProps: { rows: [] as Row[], allRows: [] as Row[], ready: false }, wrapper },
    );
    expect(result.current.page.page).toBe(2);

    const loaded = Array.from({ length: 101 }, (_, index) => ({
      id: String(index + 1), value: `Row ${index + 1}`,
    }));
    rerender({ rows: loaded, allRows: loaded, ready: true });
    await waitFor(() => expect(result.current.page.page).toBe(2));
    expect(result.current.page.rows[0].id).toBe('101');
    expect(result.current.page.pageCount).toBe(2);
  });

  it('clamps an invalid page after a loaded collection shrinks', async () => {
    const loaded = Array.from({ length: 101 }, (_, index) => ({
      id: String(index + 1), value: `Row ${index + 1}`,
    }));
    const { result, rerender } = renderHook(
      ({ rows, allRows }: { rows: Row[]; allRows: Row[] }) =>
        useInventoryPage(rows, allRows, (row) => row.id, 'meet-matches', 'all'),
      { initialProps: { rows: loaded, allRows: loaded }, wrapper },
    );
    // The URL starts on page 2; deleting down to one page should canonicalize.
    const smaller = loaded.slice(0, 20);
    rerender({ rows: smaller, allRows: smaller });
    await waitFor(() => expect(result.current.page.page).toBe(1));
    expect(result.current.page.rows).toHaveLength(20);
  });

  it('clamps a ready empty inventory to page one', async () => {
    const { result } = renderHook(
      () => useInventoryPage([], [], (row: Row) => row.id, 'meet-matches', 'all', true),
      { wrapper },
    );
    await waitFor(() => expect(result.current.page.page).toBe(1));
    expect(result.current.page.pageCount).toBe(1);
  });
});
