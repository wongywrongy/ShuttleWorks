import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TournamentPage } from '../TournamentPage';
import { useUiStore } from '../../store/uiStore';

// Stub the heavy AppShell + the kind fetch so we test only TournamentPage's
// URL→store syncing (no network, no product mount).
vi.mock('../../app/AppShell', () => ({ AppShell: () => null }));
vi.mock('../../hooks/useTournamentKind', () => ({ useTournamentKind: () => {} }));

function renderAt(seg: string) {
  return render(
    <MemoryRouter initialEntries={[`/tournaments/t1/${seg}`]}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<TournamentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ activeTab: 'setup', activeTournamentKind: 'meet' });
});

describe('TournamentPage URL→activeTab sync (no kind-snap)', () => {
  it('single-module: the segment becomes activeTab', async () => {
    renderAt('roster');
    await waitFor(() => expect(useUiStore.getState().activeTab).toBe('roster'));
  });
  it('a cross-module tab is PRESERVED when the resolved kind disagrees', async () => {
    // URL is a bracket tab; the layout effect sets the optimistic kind to
    // 'bracket'. activeTab lands on the segment.
    renderAt('bracket-setup');
    await waitFor(() => expect(useUiStore.getState().activeTab).toBe('bracket-setup'));
    // Simulate useTournamentKind resolving the REAL kind to meet (the URL
    // "lied"). The old kind-snap effect would snap bracket-setup → setup here;
    // with the snap removed, the tab is preserved so the guard can show the panel.
    act(() => {
      useUiStore.getState().setActiveTournamentKind('meet');
    });
    expect(useUiStore.getState().activeTab).toBe('bracket-setup');
  });
});
