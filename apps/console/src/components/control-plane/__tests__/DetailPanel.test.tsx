import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailPanel } from '../DetailPanel';

describe('DetailPanel', () => {
  const renderPanel = (
    onClose = vi.fn(),
    variant: 'docked' | 'overlay' = 'overlay',
  ) => {
    render(
      <div>
        <button type="button">outside</button>
        <DetailPanel
          label="Player"
          value="Kim"
          sub="Men's Singles"
          onClose={onClose}
          variant={variant}
        >
          <p>body content</p>
        </DetailPanel>
      </div>,
    );
    return onClose;
  };

  it('renders eyebrow label, heading, sub-line and children', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: 'Player Kim' });
    expect(dialog).toHaveTextContent('Player');
    expect(dialog).toHaveTextContent('Kim');
    expect(dialog).toHaveTextContent("Men's Singles");
    expect(dialog).toHaveTextContent('body content');
    expect(screen.getByTestId('detail-panel')).toBe(dialog);
  });

  it('is a dialog when overlay, a complementary region when docked', () => {
    renderPanel(vi.fn(), 'docked');
    expect(screen.getByRole('complementary', { name: 'Player Kim' })).toBe(
      screen.getByTestId('detail-panel'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes via the × button', () => {
    const onClose = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = renderPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores an Escape already claimed by an inner layer', () => {
    const onClose = renderPanel(vi.fn(), 'docked');
    const evt = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    evt.preventDefault(); // a Radix Select/Popover closing itself
    document.dispatchEvent(evt);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('overlay variant closes on outside mousedown but not on inside clicks', () => {
    const onClose = renderPanel(vi.fn(), 'overlay');
    fireEvent.mouseDown(screen.getByText('body content'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('docked variant does NOT close on outside mousedown', () => {
    // Intentional behavior change: docked panes coexist with the table —
    // clicking rows switches content, so outside clicks must not dismiss.
    const onClose = renderPanel(vi.fn(), 'docked');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('groups content under one section label recipe', () => {
    render(
      <DetailPanel label="Player" value="Kim" onClose={() => {}}>
        <DetailPanel.Section eyebrow="Availability" right={<span>2 windows</span>}>
          <p>window rows</p>
        </DetailPanel.Section>
      </DetailPanel>,
    );
    // `Eyebrow` uppercases the text content, so the DOM matches the visual
    // and a text query resolves the plain label.
    const heading = screen.getByText('AVAILABILITY');
    // The one canonical recipe: EYEBROW_CLASS (10px semibold caps, tracked).
    expect(heading.className).toContain('text-2xs');
    expect(heading.className).toContain('uppercase');
    expect(screen.getByText('2 windows')).toBeInTheDocument();
    expect(screen.getByText('window rows')).toBeInTheDocument();
  });

  it('honors a custom testId', () => {
    render(
      <DetailPanel label="Match" value="MS1" onClose={() => {}} testId="match-panel">
        <p>x</p>
      </DetailPanel>,
    );
    expect(screen.getByTestId('match-panel')).toBeInTheDocument();
  });
});
