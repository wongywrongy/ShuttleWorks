import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { WorkspaceSettingsPage } from '../WorkspaceSettingsPage';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    getTournament: vi.fn(),
    updateTournament: vi.fn(),
    deleteTournament: vi.fn(),
    getWorkspaceModules: vi.fn(),
    patchWorkspaceModule: vi.fn(),
    listMembers: vi.fn(),
    listInvites: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
  },
}));

function LocationProbe({ refObj }: { refObj: { current: string } }) {
  const loc = useLocation();
  refObj.current = loc.pathname;
  return null;
}

function mount(refObj: { current: string }) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/settings']}>
      <Routes>
        <Route
          path="/tournaments/:id/settings"
          element={<><WorkspaceSettingsPage /><LocationProbe refObj={refObj} /></>}
        />
        <Route path="*" element={<LocationProbe refObj={refObj} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(apiClient.getTournament).mockResolvedValue({
    id: 't1', name: 'My WS', kind: 'meet' as const, status: 'draft' as const,
    tournamentDate: null, createdAt: '', updatedAt: '', role: 'owner' as const, ownerName: null,
  } as never);
  vi.mocked(apiClient.getWorkspaceModules).mockResolvedValue([
    { moduleId: 'meet', status: 'enabled', config: null },
    { moduleId: 'display', status: 'available', config: null },
    { moduleId: 'bracket', status: 'coming_soon', config: null },
  ] as never);
  vi.mocked(apiClient.updateTournament).mockResolvedValue({} as never);
  vi.mocked(apiClient.deleteTournament).mockResolvedValue(undefined as never);
  vi.mocked(apiClient.patchWorkspaceModule).mockResolvedValue({} as never);
  vi.mocked(apiClient.listMembers).mockResolvedValue([] as never);
  vi.mocked(apiClient.listInvites).mockResolvedValue([] as never);
});

describe('WorkspaceSettingsPage', () => {
  it('renders the tab rail, defaults to Overview, and General loads the name', async () => {
    mount({ current: '' });
    expect(screen.getByTestId('settings-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-modules')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-danger')).toBeInTheDocument();
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument(); // default landing
    fireEvent.click(screen.getByTestId('settings-tab-general'));
    await waitFor(() =>
      expect(screen.getByLabelText('Workspace name')).toHaveValue('My WS'),
    );
  });

  it('General Save persists via updateTournament', async () => {
    mount({ current: '' });
    fireEvent.click(screen.getByTestId('settings-tab-general'));
    await waitFor(() => expect(screen.getByLabelText('Workspace name')).toHaveValue('My WS'));
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(apiClient.updateTournament).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ name: 'Renamed' }),
      ),
    );
  });

  it('Modules catalog shows capability + dependency, and enables via patch', async () => {
    mount({ current: '' });
    fireEvent.click(screen.getByTestId('settings-tab-modules'));
    await waitFor(() => expect(screen.getByTestId('settings-module-display')).toBeInTheDocument());
    const row = screen.getByTestId('settings-module-display');
    expect(within(row).getByText(/public display/i)).toBeInTheDocument();
    expect(within(row).getByText(/Needs Meet or Bracket/i)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Enable' }));
    await waitFor(() =>
      expect(apiClient.patchWorkspaceModule).toHaveBeenCalledWith('t1', 'display', {
        status: 'enabled',
      }),
    );
  });

  it('Danger Zone archives, and deletes then routes home', async () => {
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByTestId('settings-tab-danger'));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(apiClient.updateTournament).toHaveBeenCalledWith('t1', { status: 'archived' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    await waitFor(() => expect(apiClient.deleteTournament).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(loc.current).toBe('/'));
  });

  it('a not-yet-built tab is an honest placeholder', () => {
    mount({ current: '' });
    fireEvent.click(screen.getByTestId('settings-tab-sync'));
    expect(screen.getByText('Coming in a later phase.')).toBeInTheDocument();
  });

  it('People & Access and Sharing tabs render the real surfaces', () => {
    mount({ current: '' });
    fireEvent.click(screen.getByTestId('settings-tab-people'));
    expect(screen.getByText('Members & roles')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-tab-sharing'));
    expect(screen.getByLabelText('Public display link')).toBeInTheDocument();
  });

  it('opens the Sharing tab directly when ?tab=sharing is present (deep link)', () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/t1/settings?tab=sharing']}>
        <Routes>
          <Route path="/tournaments/:id/settings" element={<WorkspaceSettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('settings-tab-sharing')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Public display link')).toBeInTheDocument();
  });
});
