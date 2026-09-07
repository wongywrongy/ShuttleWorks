import { useEffect, useState } from 'react';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, beforeEach, it } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { focusListPage, useListScrollRestore } from '../useListScrollRestore';

function DelayedList() {
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const ref = useListScrollRestore<HTMLDivElement>('test-list', ready);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 20);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div>
      <div ref={ref} data-testid="test-list" data-list-scroll="test-list" data-ready={ready ? 'true' : 'false'}>
        {ready ? <div style={{ height: 1000 }}>Loaded rows</div> : 'Loading rows'}
      </div>
      <button type="button" onClick={() => navigate('/detail')}>Open row</button>
    </div>
  );
}

function Detail() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

describe('useListScrollRestore', () => {
  beforeEach(() => sessionStorage.clear());

  it('restores a list position on browser Back after delayed rows render', async () => {
    render(
      <MemoryRouter initialEntries={['/list']}>
        <Routes>
          <Route path="/list" element={<DelayedList />} />
          <Route path="/detail" element={<Detail />} />
        </Routes>
      </MemoryRouter>,
    );

    const list = await screen.findByTestId('test-list');
    await waitFor(() => expect(list).toHaveAttribute('data-ready', 'true'));
    Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: 240 });
    fireEvent.scroll(list);
    fireEvent.click(screen.getByRole('button', { name: 'Open row' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));

    const restoredList = await screen.findByTestId('test-list');
    expect(restoredList).toHaveAttribute('data-ready', 'false');
    await waitFor(() => expect(restoredList).toHaveAttribute('data-ready', 'true'));
    await waitFor(() => expect(restoredList).toHaveProperty('scrollTop', 240));
  });

  it('focuses and resets a list for explicit page navigation', () => {
    const list = document.createElement('div');
    list.scrollTop = 90;
    document.body.appendChild(list);
    focusListPage(list);
    expect(list.scrollTop).toBe(0);
    expect(list).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(list);
    list.remove();
  });

  it('can mount without a router in isolated inventory tests', () => {
    expect(() => renderHook(() => useListScrollRestore<HTMLDivElement>('plain'))).not.toThrow();
  });
});
