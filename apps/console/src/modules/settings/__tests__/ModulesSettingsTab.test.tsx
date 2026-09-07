import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ModulesSettingsTab } from '../ModulesSettingsTab';
import { useWorkspaceModules } from '../../../platform/domain/useWorkspaceModules';

vi.mock('../../../platform/domain/useWorkspaceModules', () => ({ useWorkspaceModules: vi.fn() }));

const enable = vi.fn();
const disable = vi.fn();

describe('ModulesSettingsTab', () => {
  beforeEach(() => {
    enable.mockReset();
    disable.mockReset();
    vi.mocked(useWorkspaceModules).mockReturnValue({
      modules: [
        { id: 'meet', label: 'Meet', status: 'enabled', hasData: false },
        { id: 'display', label: 'Display', status: 'available', hasData: false },
      ],
      loading: false,
      error: false,
      enable,
      disable,
      refetch: vi.fn(),
    });
  });

  it('renders each module as one switch and turns one on', () => {
    render(<ModulesSettingsTab tid="t1" />);
    const display = screen.getByRole('radiogroup', { name: 'Display' });
    fireEvent.click(within(display).getByRole('radio', { name: 'On' }));
    expect(enable).toHaveBeenCalledWith('display');
  });

  it('keeps the last operational module on, with one reason', () => {
    render(<ModulesSettingsTab tid="t1" />);
    expect(screen.getByTestId('module-reason-meet')).toHaveTextContent(
      "Last operational module: can't turn off.",
    );
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Meet' })).getByRole('radio', { name: 'Off' }),
    );
    expect(disable).not.toHaveBeenCalled();
  });

  it('no longer offers a per-module Configure link', () => {
    render(<ModulesSettingsTab tid="t1" />);
    expect(screen.queryByRole('button', { name: 'Configure' })).toBeNull();
  });
});
