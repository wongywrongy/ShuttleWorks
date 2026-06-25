import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleDock } from '../ModuleDock';
import type { WorkspaceModule } from '../types';

const modules: WorkspaceModule[] = [
  { id: 'meet', label: 'Meet', status: 'enabled' },
  { id: 'bracket', label: 'Bracket', status: 'coming-soon', note: 'Bracket is not enabled for this workspace yet.' },
  { id: 'display', label: 'Display', status: 'available' },
];

describe('ModuleDock', () => {
  it('renders all modules and marks the active one', () => {
    render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
    expect(screen.getByTestId('module-meet')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('module-display')).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the active module as current (running)', () => {
    render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
    expect(screen.getByTestId('module-meet')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('module-display')).not.toHaveAttribute('aria-current');
  });

  it('shows a Manage affordance that calls onManage when provided', async () => {
    const onManage = vi.fn();
    render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} onManage={onManage} />);
    await userEvent.click(screen.getByTestId('module-manage'));
    expect(onManage).toHaveBeenCalled();
  });

  it('omits the Manage affordance when onManage is absent', () => {
    render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
    expect(screen.queryByTestId('module-manage')).toBeNull();
  });

  it('disables a coming-soon module and exposes the roadmap note', () => {
    render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
    const bracket = screen.getByTestId('module-bracket');
    expect(bracket).toBeDisabled();
    expect(bracket).toHaveAttribute('title', 'Bracket is not enabled for this workspace yet.');
  });

  it('fires onSelect only for enterable modules (enabled/available)', async () => {
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

  it('a disabled module shows an Enable affordance that calls onEnable (not onSelect)', async () => {
    const onSelect = vi.fn();
    const onEnable = vi.fn();
    const withDisabled: WorkspaceModule[] = [
      { id: 'meet', label: 'Meet', status: 'enabled' },
      { id: 'display', label: 'Display', status: 'disabled', note: 'Display is turned off — re-enable to use it.' },
    ];
    render(
      <ModuleDock modules={withDisabled} active="meet" onSelect={onSelect} onEnable={onEnable} />,
    );
    const display = screen.getByTestId('module-display');
    expect(display).toHaveAttribute('title', 'Enable Display');
    await userEvent.click(display);
    expect(onEnable).toHaveBeenCalledWith('display');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
