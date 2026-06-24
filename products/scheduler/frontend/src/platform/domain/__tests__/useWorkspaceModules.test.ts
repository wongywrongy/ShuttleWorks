import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWorkspaceModules } from '../useWorkspaceModules';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    getWorkspaceModules: vi.fn(),
    patchWorkspaceModule: vi.fn(),
  },
}));

describe('useWorkspaceModules', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getWorkspaceModules).mockReset();
    vi.mocked(apiClient.patchWorkspaceModule).mockReset();
  });

  it('fetches and maps the module catalog into the dock shape', async () => {
    vi.mocked(apiClient.getWorkspaceModules).mockResolvedValue([
      { moduleId: 'meet', status: 'enabled', config: null },
      { moduleId: 'display', status: 'available', config: null },
    ]);
    const { result } = renderHook(() => useWorkspaceModules('t1'));
    await waitFor(() => expect(result.current.modules).not.toBeNull());
    expect(result.current.modules!.map((m) => m.id)).toEqual(['meet', 'display']);
  });

  it('enable() patches status=enabled then refetches', async () => {
    vi.mocked(apiClient.getWorkspaceModules).mockResolvedValue([
      { moduleId: 'display', status: 'disabled', config: null },
    ]);
    vi.mocked(apiClient.patchWorkspaceModule).mockResolvedValue({
      moduleId: 'display',
      status: 'enabled',
      config: null,
    });
    const { result } = renderHook(() => useWorkspaceModules('t1'));
    await waitFor(() => expect(result.current.modules).not.toBeNull());
    await act(async () => {
      await result.current.enable('display');
    });
    expect(apiClient.patchWorkspaceModule).toHaveBeenCalledWith('t1', 'display', {
      status: 'enabled',
    });
    expect(vi.mocked(apiClient.getWorkspaceModules).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('null tid does not fetch', () => {
    renderHook(() => useWorkspaceModules(null));
    expect(apiClient.getWorkspaceModules).not.toHaveBeenCalled();
  });
});
