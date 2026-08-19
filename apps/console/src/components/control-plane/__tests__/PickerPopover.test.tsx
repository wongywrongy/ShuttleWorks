import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { PickerPopover } from '../PickerPopover';

function Harness({ onPick = () => {} }: { onPick?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <PickerPopover open={open} onOpenChange={setOpen}>
      <PickerPopover.Anchor asChild>
        <div>
          <button type="button" onClick={() => setOpen((v) => !v)}>
            open picker
          </button>
        </div>
      </PickerPopover.Anchor>
      <PickerPopover.Panel data-testid="picker-panel">
        <button type="button" onClick={onPick}>
          option one
        </button>
      </PickerPopover.Panel>
    </PickerPopover>
  );
}

describe('PickerPopover', () => {
  it('opens on trigger click and stays open when an option is toggled', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    expect(screen.queryByTestId('picker-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'open picker' }));
    expect(screen.getByTestId('picker-panel')).toBeInTheDocument();

    // A picker (not a menu): selecting an option must NOT auto-close.
    fireEvent.click(screen.getByRole('button', { name: 'option one' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('picker-panel')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'open picker' }));
    expect(screen.getByTestId('picker-panel')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('picker-panel'), { key: 'Escape' });
    expect(screen.queryByTestId('picker-panel')).toBeNull();
  });

  it('portals the panel out of the anchor subtree (overflow-clip immunity)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'open picker' }));
    const panel = screen.getByTestId('picker-panel');
    const trigger = screen.getByRole('button', { name: 'open picker' });
    // The panel must NOT be a DOM descendant of the anchor/cell — that's
    // exactly what let overflow-auto ancestors clip the old dropdown.
    expect(trigger.parentElement?.contains(panel)).toBe(false);
  });
});
