/**
 * The brand lockup (SP-UI-1 P1). The old mark was the wordmark inside a 1px
 * frame; the frame is gone and a monogram tile carries the contrast. What must
 * NOT change is the accessible name — the mark is a labelled landmark on three
 * page headers and the auth screens.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShuttleWorksMark, SwMonogram } from '../ShuttleWorksMark';

describe('ShuttleWorksMark', () => {
  it('keeps its accessible name and renders the wordmark as text', () => {
    render(<ShuttleWorksMark />);
    const mark = screen.getByLabelText('ShuttleWorks');
    expect(mark).toHaveTextContent('ShuttleWorks');
  });

  it('no longer draws the bordered-box treatment', () => {
    const { container } = render(<ShuttleWorksMark />);
    // The retired mark was `border border-foreground rounded-[4px]` on the
    // wordmark itself — a frame that read as an unstyled button.
    expect(container.querySelector('.border-foreground')).toBeNull();
  });

  it('renders the bare Console chip by default and adds the tile on tile={true}', () => {
    // Console direction (2026-08-13): the chevron-clipped accent chip IS the
    // mark, so the monogram tile is opt-in rather than default.
    const { container: bare } = render(<ShuttleWorksMark />);
    expect(bare.textContent).toBe('ShuttleWorks');

    const { container: withTile } = render(<ShuttleWorksMark tile />);
    expect(withTile.textContent).toContain('SW');
  });

  it('hides the tile from the accessibility tree (it is decoration beside the name)', () => {
    const { container } = render(<SwMonogram />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden');
  });
});
