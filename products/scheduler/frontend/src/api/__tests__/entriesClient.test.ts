/**
 * The three Entries desk client methods (SP-E1-1).
 *
 * These are thin, which is exactly why they need a test: nothing else in the
 * frontend spells the route strings or the `entry_event_id` query-param name,
 * so a typo would surface as a 404 in the browser and nowhere in the suite.
 * The desk's own tests stub `apiClient.*` wholesale and would not notice.
 *
 * The private axios instance is reached through a cast — deliberately, so the
 * assertion is about the URL that actually goes on the wire rather than about
 * a wrapper we wrote to be assertable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import { apiClient } from '../client';

const axiosOf = (): AxiosInstance =>
  (apiClient as unknown as { client: AxiosInstance }).client;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiClient.listEntries', () => {
  it('GETs the workspace-scoped desk list', async () => {
    const get = vi
      .spyOn(axiosOf(), 'get')
      .mockResolvedValue({ data: [] } as never);

    await apiClient.listEntries('t-1');

    expect(get).toHaveBeenCalledWith('/tournaments/t-1/entries', {
      params: undefined,
    });
  });

  it('passes a state filter through as a query param', async () => {
    const get = vi
      .spyOn(axiosOf(), 'get')
      .mockResolvedValue({ data: [] } as never);

    await apiClient.listEntries('t-1', 'pending');

    expect(get).toHaveBeenCalledWith('/tournaments/t-1/entries', {
      params: { state: 'pending' },
    });
  });
});

describe('apiClient.confirmEntry', () => {
  it('POSTs to the entry-scoped confirm route', async () => {
    const post = vi
      .spyOn(axiosOf(), 'post')
      .mockResolvedValue({ data: { id: 'e-1' } } as never);

    await apiClient.confirmEntry('t-1', 'e-1');

    expect(post).toHaveBeenCalledWith('/tournaments/t-1/entries/e-1/confirm');
  });
});

describe('apiClient.commitEntries', () => {
  it('POSTs the commit with no event filter by default', async () => {
    const post = vi
      .spyOn(axiosOf(), 'post')
      .mockResolvedValue({ data: { committed: [], skipped: [] } } as never);

    await apiClient.commitEntries('t-1');

    expect(post).toHaveBeenCalledWith(
      '/tournaments/t-1/entries/commit',
      undefined,
      { params: undefined },
    );
  });

  it("names the event filter exactly the backend's `entry_event_id`", async () => {
    // The backend Query param is snake_case; sending `entryEventId` would be
    // silently ignored and commit the WHOLE workspace instead of one event.
    const post = vi
      .spyOn(axiosOf(), 'post')
      .mockResolvedValue({ data: { committed: [], skipped: [] } } as never);

    await apiClient.commitEntries('t-1', 'ev-9');

    expect(post).toHaveBeenCalledWith(
      '/tournaments/t-1/entries/commit',
      undefined,
      { params: { entry_event_id: 'ev-9' } },
    );
  });
});
