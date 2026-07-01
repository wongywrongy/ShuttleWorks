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
});
