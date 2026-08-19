import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverflowMenu } from '../OverflowMenu';

describe('OverflowMenu', () => {
  it('opens and invokes the selected item', () => {
    const onDelete = vi.fn();
    render(
      <OverflowMenu
        items={[
          { key: 'settings', label: 'Settings', onSelect: () => {} },
          { key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, testId: 'overflow-delete' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  // W3: the Hub row's menu put `Settings` and `Delete` as adjacent 32px
  // targets with no gap and no rule, so a 32px slip crossed from one to the
  // other. The rule does not make the slip impossible, it makes the boundary
  // visible, which is the least a menu owes before its last item deletes a
  // workspace.
  it('draws a rule above a separated item, and none without one', () => {
    const items = [
      { key: 'settings', label: 'Settings', onSelect: () => {} },
      { key: 'delete', label: 'Delete', onSelect: () => {}, destructive: true, separator: true },
    ];
    const { container, rerender } = render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(container.ownerDocument.querySelectorAll('[aria-hidden].border-t')).toHaveLength(1);

    rerender(<OverflowMenu items={items.map((i) => ({ ...i, separator: false }))} />);
    expect(container.ownerDocument.querySelectorAll('[aria-hidden].border-t')).toHaveLength(0);
  });

  it('still invokes a separated item', () => {
    const onDelete = vi.fn();
    render(
      <OverflowMenu
        items={[
          { key: 'settings', label: 'Settings', onSelect: () => {} },
          { key: 'delete', label: 'Delete', onSelect: onDelete, separator: true, testId: 'sep-delete' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByTestId('sep-delete'));
    expect(onDelete).toHaveBeenCalled();
  });
});
