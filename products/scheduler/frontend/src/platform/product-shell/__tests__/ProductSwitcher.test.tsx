import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductSwitcher } from '../ProductSwitcher';
import type { ProductSwitcherItem } from '../types';

const items: ProductSwitcherItem[] = [
  { id: 'meet', label: 'Meet', available: true },
  { id: 'bracket', label: 'Bracket', available: false, disabledReason: 'nope' },
  { id: 'display', label: 'Display', available: true },
];

describe('ProductSwitcher', () => {
  it('renders all products and marks the active one', () => {
    render(<ProductSwitcher products={items} active="meet" onSelect={() => {}} />);
    expect(screen.getByTestId('product-meet')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('product-display')).toHaveAttribute('aria-selected', 'false');
  });

  it('disables unavailable products and exposes the reason', () => {
    render(<ProductSwitcher products={items} active="meet" onSelect={() => {}} />);
    const bracket = screen.getByTestId('product-bracket');
    expect(bracket).toBeDisabled();
    expect(bracket).toHaveAttribute('title', 'nope');
  });

  it('fires onSelect only for available products', async () => {
    const onSelect = vi.fn();
    render(<ProductSwitcher products={items} active="meet" onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('product-display'));
    await userEvent.click(screen.getByTestId('product-bracket'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('display');
  });

  it('does not fire onSelect when clicking the already-active product', async () => {
    const onSelect = vi.fn();
    render(<ProductSwitcher products={items} active="meet" onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('product-meet'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fires onSelect when switching from the active product to a different available product', async () => {
    const onSelect = vi.fn();
    render(<ProductSwitcher products={items} active="meet" onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('product-display'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('display');
  });
});
