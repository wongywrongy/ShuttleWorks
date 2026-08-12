/**
 * The in-shell Preview tab (`DisplayProduct`, mounted at
 * `/tournaments/:id/tv`) renders the same board the standalone `/display`
 * route does — but the standalone route carries the workspace in the QUERY
 * (`?token=` / `?id=`) while the preview carries it in the PATH. Two of the
 * board's three resolvers read only `useSearchParams`, so on the preview they
 * never resolved a workspace at all: the kind stayed `null` forever (falling
 * through to the meet placeholder even for a bracket workspace) and the
 * bracket poll never fired a single request.
 *
 * `useDisplaySync` already had the `params.id` fallback; these are its two
 * siblings.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDisplayKind } from '../useDisplayKind';
import { useBracketDisplaySync } from '../bracketDisplay/useBracketDisplaySync';
import { apiClient } from '../../../api/client';
import type { TournamentSummaryDTO } from '../../../api/dto';

const BRACKET_WORKSPACE = {
  id: 't1',
  kind: 'bracket',
  modules: [{ id: 'bracket', label: 'Bracket', status: 'enabled' }],
} as unknown as TournamentSummaryDTO;

/** The preview route: workspace id in the path, nothing in the query. */
function previewRoute({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/tournaments/t1/tv']}>
      <Routes>
        <Route path="/tournaments/:id/tv" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('in-shell Preview — resolves the workspace from the route path', () => {
  it('useDisplayKind reads :id and resolves a bracket workspace', async () => {
    vi.spyOn(apiClient, 'getTournament').mockResolvedValue(BRACKET_WORKSPACE);

    const { result } = renderHook(() => useDisplayKind(), { wrapper: previewRoute });

    await waitFor(() => expect(result.current).toBe('bracket'));
    expect(apiClient.getTournament).toHaveBeenCalledWith('t1');
  });

  it('useBracketDisplaySync reads :id and polls the workspace', async () => {
    vi.spyOn(apiClient, 'getBracket').mockResolvedValue(null);

    renderHook(() => useBracketDisplaySync(new Date()), { wrapper: previewRoute });

    await waitFor(() => expect(apiClient.getBracket).toHaveBeenCalledWith('t1'));
  });
});
