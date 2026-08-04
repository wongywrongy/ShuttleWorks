import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailDock } from '../DetailDock';

const renderDock = (open: boolean, extra: Partial<Parameters<typeof DetailDock>[0]> = {}) =>
  render(
    <div className="relative flex">
      <div>table</div>
      <DetailDock open={open} {...extra}>
        <p>pane content</p>
      </DetailDock>
    </div>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DetailDock', () => {
  it('is a zero-width column when closed', () => {
    renderDock(false);
    const dock = screen.getByTestId('detail-dock');
    expect(dock.style.width).toBe('0px');
    expect(screen.queryByText('pane content')).toBeNull();
  });

  it('opens to its configured width as a real layout column (docked mode)', () => {
    renderDock(true, { width: 320 });
    const dock = screen.getByTestId('detail-dock');
    expect(dock.dataset.mode).toBe('docked');
    expect(dock.style.width).toBe('320px');
    expect(screen.getByText('pane content')).toBeInTheDocument();
    // Docked = flex sibling, never an overlay layer.
    expect(dock.className).toContain('sw-dock-transition');
    expect(dock.querySelector('.z-overlay')).toBeNull();
  });

  it('falls back to overlay mode when the container is too narrow', () => {
    // ResizeObserver that reports a parent too narrow for pane + content.
    class NarrowRO {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe() {
        this.cb(
          [{ contentRect: { width: 800 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', NarrowRO);

    renderDock(true, { width: 380, minContentWidth: 560 }); // 800 - 380 < 560
    const dock = screen.getByTestId('detail-dock');
    expect(dock.dataset.mode).toBe('overlay');
    expect(dock.style.width).toBe('0px'); // steals no layout width
    expect(dock.querySelector('.z-overlay')).not.toBeNull();
    expect(screen.getByText('pane content')).toBeInTheDocument();
  });

  it('stays docked when the container has room', () => {
    class WideRO {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe() {
        this.cb(
          [{ contentRect: { width: 1400 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', WideRO);

    renderDock(true, { width: 380, minContentWidth: 560 }); // 1400 - 380 >= 560
    expect(screen.getByTestId('detail-dock').dataset.mode).toBe('docked');
  });

  it('retains the last children while the close transition runs', () => {
    const { rerender } = renderDock(true);
    expect(screen.getByText('pane content')).toBeInTheDocument();
    rerender(
      <div className="relative flex">
        <div>table</div>
        <DetailDock open={false}>
          <p>pane content</p>
        </DetailDock>
      </div>,
    );
    const dock = screen.getByTestId('detail-dock');
    // Width snaps to 0 immediately (the CSS transition animates it)…
    expect(dock.style.width).toBe('0px');
    // …but the content is retained until transitionend/fallback clears it.
    expect(screen.getByText('pane content')).toBeInTheDocument();
  });
});
