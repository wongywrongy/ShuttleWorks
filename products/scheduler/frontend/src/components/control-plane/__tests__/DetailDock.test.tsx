import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailDock } from '../DetailDock';
import { DetailPanel } from '../DetailPanel';

const renderDock = (open: boolean, extra: Partial<Parameters<typeof DetailDock>[0]> = {}) =>
  render(
    <div className="relative flex">
      <div>table</div>
      <DetailDock open={open} {...extra}>
        <p>pane content</p>
      </DetailDock>
    </div>,
  );

/** A ResizeObserver that reports one fixed container width. */
function stubWidth(width: number) {
  class FixedRO {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe() {
      this.cb(
        [{ contentRect: { width } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FixedRO);
}

/** A dock hosting the pane chrome consumers actually put in it. */
const renderDockedPanel = (containerWidth: number, onClose = vi.fn()) => {
  stubWidth(containerWidth);
  render(
    <div className="relative flex">
      <button type="button">table row</button>
      <DetailDock open width={380} minContentWidth={560}>
        <DetailPanel label="Player" value="Kim" onClose={onClose} variant="docked">
          <p>pane content</p>
        </DetailPanel>
      </DetailDock>
    </div>,
  );
  return onClose;
};

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
    stubWidth(800); // too narrow for pane + content

    renderDock(true, { width: 380, minContentWidth: 560 }); // 800 - 380 < 560
    const dock = screen.getByTestId('detail-dock');
    expect(dock.dataset.mode).toBe('overlay');
    expect(dock.style.width).toBe('0px'); // steals no layout width
    expect(dock.querySelector('.z-overlay')).not.toBeNull();
    expect(screen.getByText('pane content')).toBeInTheDocument();
  });

  it('stays docked when the container has room', () => {
    stubWidth(1400);

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

/**
 * The overlay fallback used to be silent: it covered the table while the pane
 * inside it still said `role="complementary"` and still refused to dismiss on
 * an outside click, because the consumer wrote `variant="docked"` and the
 * dock never told it otherwise. `DockModeContext` is that seam.
 */
describe('DetailDock tells the pane it demoted it to an overlay', () => {
  it('a demoted pane is a dialog and dismisses on an outside mousedown', () => {
    const onClose = renderDockedPanel(800); // 800 - 380 < 560 → overlay
    expect(screen.getByTestId('detail-dock').dataset.mode).toBe('overlay');

    const pane = screen.getByTestId('detail-panel');
    expect(pane.getAttribute('role')).toBe('dialog');
    expect(screen.queryByRole('complementary')).toBeNull();

    // A click INSIDE the pane it is covering must not dismiss it.
    fireEvent.mouseDown(screen.getByText('pane content'));
    expect(onClose).not.toHaveBeenCalled();

    // A click on the content it is covering is the operator saying "put it
    // away" — the affordance the fallback had no other way to offer.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'table row' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a demoted pane dismisses on Escape', () => {
    const onClose = renderDockedPanel(800);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a genuinely docked pane keeps complementary and ignores outside clicks', () => {
    // The behaviour docked mode deliberately has: operators click row to row
    // and the pane follows, so an outside click must NOT dismiss.
    const onClose = renderDockedPanel(1400);
    expect(screen.getByTestId('detail-dock').dataset.mode).toBe('docked');
    expect(screen.getByTestId('detail-panel').getAttribute('role')).toBe(
      'complementary',
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'table row' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a demoted pane keeps the dock-owned geometry, not its own', () => {
    // Only role and dismissal flip. The dock's overlay layer already supplies
    // position, border and shadow; a pane that also went absolute would
    // double them.
    renderDockedPanel(800);
    const pane = screen.getByTestId('detail-panel');
    expect(pane.className).toContain('h-full');
    expect(pane.className).not.toContain('absolute');
  });
});
