/**
 * The keyboard contract every clickable row inherits (audit G1-followup).
 *
 * Pointer activation was never the bug — these rows always worked with a mouse.
 * What follows pins the part that was missing: the row is reachable and
 * operable without one, and it yields its keys to nested controls.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { selectableRowProps } from '../selectableRow';

function Row({ onSelect, selected = false }: { onSelect: () => void; selected?: boolean }) {
  return (
    <li {...selectableRowProps(onSelect, selected)}>
      Match 1
      <button type="button" onClick={() => {}}>
        Delete
      </button>
      <input aria-label="score" />
    </li>
  );
}

describe('selectableRowProps', () => {
  it('exposes the row as a button and makes it tabbable', () => {
    render(<Row onSelect={vi.fn()} />);
    const row = screen.getByRole('button', { name: /match 1/i });
    expect(row).toHaveAttribute('tabindex', '0');
  });

  it('announces selection via aria-pressed', () => {
    const { rerender } = render(<Row onSelect={vi.fn()} selected={false} />);
    expect(screen.getByRole('button', { name: /match 1/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    rerender(<Row onSelect={vi.fn()} selected />);
    expect(screen.getByRole('button', { name: /match 1/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it.each([
    ['{Enter}', 'Enter'],
    [' ', 'Space'],
  ])('selects on %s from the keyboard', async (key) => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    const row = screen.getByRole('button', { name: /match 1/i });
    row.focus();
    await userEvent.keyboard(key);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('still selects on click', async () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /match 1/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not hijack keys from a nested control', async () => {
    // Space inside the row's own input must type a space, not select the row —
    // this is why the handler checks `e.target !== e.currentTarget`.
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    const input = screen.getByLabelText('score');
    input.focus();
    await userEvent.keyboard(' ');
    expect(onSelect).not.toHaveBeenCalled();
    expect(input).toHaveValue(' ');
  });

  it('ignores keys that are neither Enter nor Space', async () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    screen.getByRole('button', { name: /match 1/i }).focus();
    await userEvent.keyboard('{Escape}a{ArrowDown}');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
