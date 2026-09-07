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
    // Model a real browser: a detached node reports scrollTop 0, so the value
    // is only readable while the list is still connected.
    let listScrollTop = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => (list.isConnected ? listScrollTop : 0),
      set: (value: number) => { listScrollTop = value; },
    });
    list.scrollTop = 240;
    fireEvent.scroll(list);
    fireEvent.click(screen.getByRole('button', { name: 'Open row' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));

    const restoredList = await screen.findByTestId('test-list');
    expect(restoredList).toHaveAttribute('data-ready', 'false');
    await waitFor(() => expect(restoredList).toHaveAttribute('data-ready', 'true'));
    await waitFor(() => expect(restoredList).toHaveProperty('scrollTop', 240));
  });

  it('keeps the last listener position when unmount reports a detached scrollTop', () => {
    function PlainList() {
      const ref = useListScrollRestore<HTMLDivElement>('detach-list');
      return <div ref={ref} data-testid="detach-list" />;
    }
    const { unmount } = render(
      <MemoryRouter initialEntries={['/list']}>
        <PlainList />
      </MemoryRouter>,
    );
    const list = screen.getByTestId('detach-list');
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => (list.isConnected ? 320 : 0),
      set: () => {},
    });
    fireEvent.scroll(list);
    const key = 'shuttleworks:list-scroll:detach-list:/list';
    expect(sessionStorage.getItem(key)).toBe('320');

    // Passive effect cleanup runs after React detaches the node.
    unmount();
    expect(sessionStorage.getItem(key)).toBe('320');
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
