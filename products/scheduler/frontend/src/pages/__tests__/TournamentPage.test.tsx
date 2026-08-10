import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TournamentPage } from '../TournamentPage';
import { useUiStore } from '../../store/uiStore';
import { buildWorkspaceNav } from '../../platform/product-shell/workspaceNav';
import type { ModuleId } from '../../platform/product-shell/types';

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

describe('an unrecognised segment is an honest not-found', () => {
  it('renders not-found instead of silently falling back to Meet Configuration', async () => {
    renderAt('zzzz-not-a-segment');
    await waitFor(() => expect(screen.getByTestId('workspace-not-found')).toBeTruthy());
    // The URL never became a tab, so the shell must not have rendered a surface
    // under it (before the fix this left activeTab on its default and the Meet
    // Configuration page rendered under a nonsense URL).
    expect(useUiStore.getState().activeTab).toBe('setup');
  });

  it('accepts EVERY segment the workspace nav can route to', () => {
    // The not-found guard must never swallow a real destination. Derived from
    // the nav model itself (both kinds, every module enabled) so a new nav
    // segment that forgets the routable list fails here, not in a browser.
    const every: ModuleId[] = ['meet', 'bracket', 'display', 'entries'];
    const segments = new Set<string>();
    for (const kind of ['meet', 'bracket'] as const) {
      const nav = buildWorkspaceNav(kind, new Set(every));
      segments.add(nav.overview.segment);
      for (const s of nav.sections) for (const it of s.items) segments.add(it.segment);
      for (const it of nav.admin.items) segments.add(it.segment);
    }
    for (const seg of segments) {
      const { unmount } = renderAt(seg);
      expect(screen.queryByTestId('workspace-not-found'), `segment ${seg}`).toBeNull();
      unmount();
    }
  });
});
