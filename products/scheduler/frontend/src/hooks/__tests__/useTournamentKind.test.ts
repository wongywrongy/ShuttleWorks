/**
 * The uniform-404 seam, on the client side.
 *
 * A workspace owned by another organisation answers `404 TOURNAMENT_NOT_FOUND`
 * — deliberately byte-identical to a workspace that does not exist, so
 * membership cannot be probed. This hook is the first request the workspace
 * route makes, so it is where that answer has to be recognised: everything
 * downstream (the shell, the config form, its Save button) mounts on the
 * assumption that the workspace is ours.
 *
 * The distinction that matters is 404 vs everything else. A 500 or a dropped
 * connection means "ask again", not "gone" — answering not-found there would
 * evict an operator from their own workspace the moment the wifi blinks.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTournamentKind } from '../useTournamentKind';
import { apiClient } from '../../api/client';
import { useUiStore } from '../../store/uiStore';

const failWith = (status: number) =>
  Object.assign(new Error('request failed'), { status });

beforeEach(() => {
  useUiStore.setState({ activeTournamentKind: 'meet' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTournamentKind', () => {
  it('reports not-found when the workspace answers 404', async () => {
    vi.spyOn(apiClient, 'getTournament').mockRejectedValue(failWith(404));
    const { result } = renderHook(() => useTournamentKind('t1'));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('NEGATIVE CONTROL: a 500 is transient, not a not-found', async () => {
    vi.spyOn(apiClient, 'getTournament').mockRejectedValue(failWith(500));
    const { result } = renderHook(() => useTournamentKind('t1'));
    // The catch has run once the last-known kind has been cleared.
    await waitFor(() => expect(useUiStore.getState().activeTournamentKind).toBeNull());
    expect(result.current).toBe(false);
  });

  it('NEGATIVE CONTROL: a workspace we can read is never not-found', async () => {
    vi.spyOn(apiClient, 'getTournament').mockResolvedValue({
      id: 't1',
      kind: 'bracket',
    } as never);
    const { result } = renderHook(() => useTournamentKind('t1'));
    await waitFor(() =>
      expect(useUiStore.getState().activeTournamentKind).toBe('bracket'),
    );
    expect(result.current).toBe(false);
  });
});
