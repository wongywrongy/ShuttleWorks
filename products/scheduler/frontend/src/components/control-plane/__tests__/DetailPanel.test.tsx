import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailPanel } from '../DetailPanel';

describe('DetailPanel', () => {
  const renderPanel = (onClose = vi.fn()) => {
    render(
      <div>
        <button type="button">outside</button>
        <DetailPanel label="Player" value="Kim" sub="Men's Singles" onClose={onClose}>
          <p>body content</p>
        </DetailPanel>
      </div>,
    );
    return onClose;
  };

  it('renders eyebrow label, heading, sub-line and children as a dialog', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: 'Player Kim' });
    expect(dialog).toHaveTextContent('Player');
    expect(dialog).toHaveTextContent('Kim');
    expect(dialog).toHaveTextContent("Men's Singles");
    expect(dialog).toHaveTextContent('body content');
    expect(screen.getByTestId('detail-panel')).toBe(dialog);
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

  it('closes on outside mousedown but not on inside clicks', () => {
    const onClose = renderPanel();
    fireEvent.mouseDown(screen.getByText('body content'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).toHaveBeenCalledTimes(1);
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
