import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ModulesSettingsTab } from '../ModulesSettingsTab';
import { useWorkspaceModules } from '../../../platform/domain/useWorkspaceModules';

vi.mock('../../../platform/domain/useWorkspaceModules', () => ({ useWorkspaceModules: vi.fn() }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('ModulesSettingsTab', () => {
  beforeEach(() => {
    vi.mocked(useWorkspaceModules).mockReturnValue({
      modules: [
        { id: 'meet', label: 'Meet', status: 'enabled', hasData: false },
        { id: 'display', label: 'Display', status: 'available', hasData: false },
      ],
      loading: false,
      error: false,
      enable: vi.fn(),
      disable: vi.fn(),
      refetch: vi.fn(),
    });
  });

  it('links each module to its canonical configuration surface', () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/t1/administration/modules']}>
        <Routes>
          <Route path="*" element={<><ModulesSettingsTab tid="t1" /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('settings-module-display').querySelector('button')!);
    expect(screen.getByTestId('location')).toHaveTextContent('/tournaments/t1/publish/displays');
  });
});
