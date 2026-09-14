import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AxiosInstance } from 'axios';
import { apiClient } from '../client';
import { useBracketDisplaySync } from '../../modules/display/bracketDisplay/useBracketDisplaySync';

const transport = (apiClient as unknown as { client: AxiosInstance }).client;
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/display?token=public-link']}>{children}</MemoryRouter>
);

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('public bracket capability denial', () => {
  it('preserves a real 404 through the client, clears the projection and stops polling', async () => {
    vi.useFakeTimers();
    const projection = { events: [], participants: [], play_units: [], assignments: [], results: [] };
    const get = vi.spyOn(transport, 'get').mockResolvedValueOnce({ status: 200, data: projection });
    // Model the transport's status policy, rather than mocking apiClient's
    // return value: accepting 404 here used to turn the denial into null.
    get.mockImplementation(async (_url, config) => {
      const response = { status: 404, data: { detail: { code: 'TOURNAMENT_NOT_FOUND' } } };
      if ((config?.validateStatus ?? transport.defaults.validateStatus)?.(404)) return response;
      throw Object.assign(new Error('Not found'), { response });
    });
    const { result } = renderHook(() => useBracketDisplaySync(new Date()), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data).toEqual(projection);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.terminal).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.lastSyncedAt).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(40_000); });
    expect(get).toHaveBeenCalledTimes(2);
  });
});
