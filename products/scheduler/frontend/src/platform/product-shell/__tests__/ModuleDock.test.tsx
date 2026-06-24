import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleDock } from '../ModuleDock';
import type { WorkspaceModule } from '../types';

const modules: WorkspaceModule[] = [
  { id: 'meet', label: 'Meet', status: 'enabled' },
  { id: 'bracket', label: 'Bracket', status: 'not-enabled', note: 'Bracket is not enabled for this workspace.' },
  { id: 'display', label: 'Display', status: 'available' },
];

describe('ModuleDock', () => {
  it('renders all modules and marks the active one', () => {
    render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
    expect(screen.getByTestId('module-meet')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('module-display')).toHaveAttribute('aria-selected', 'false');
  });

  it('disables non-enterable modules and exposes the enablement note', () => {
    render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
    const bracket = screen.getByTestId('module-bracket');
    expect(bracket).toBeDisabled();
    expect(bracket).toHaveAttribute('title', 'Bracket is not enabled for this workspace.');
  });

  it('fires onSelect only for enterable modules', async () => {
    const onSelect = vi.fn();
    render(<ModuleDock modules={modules} active="meet" onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('module-display'));
    await userEvent.click(screen.getByTestId('module-bracket'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('display');
  });

  it('does not fire onSelect when clicking the already-active module', async () => {
    const onSelect = vi.fn();
    render(<ModuleDock modules={modules} active="meet" onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('module-meet'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
