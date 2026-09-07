/**
 * URL → store sync for the per-tournament shell.
 *
 * Canonical workflow URLs are the only UI routes. Renderer tab names stay
 * internal and are selected from the workflow route registry.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TournamentPage } from '../../pages/TournamentPage';
import { useUiStore } from '../../store/uiStore';

// Mock useTournamentKind so the page doesn't fetch /tournaments/:id.
vi.mock('../../hooks/useTournamentKind', () => ({
  useTournamentKind: () => undefined,
}));
// Mock AppShell — we only care about the page's own URL→store sync,
// not what AppShell renders.
vi.mock('../../app/AppShell', () => ({
  AppShell: () => null,
}));

function mountAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<TournamentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'setup',
    activeTournamentKind: null,
    activeTournamentId: null,
  });
});

describe('TournamentPage URL → store sync', () => {
  it('sets activeTab = "setup" when mounted at /setup/details', () => {
    mountAt('/tournaments/t1/setup/details');
    expect(useUiStore.getState().activeTab).toBe('setup');
    // Setup is kind-agnostic (a registered workflow route), so no optimistic
    // kind is guessed — the fetched summary is the only source of truth. The
    // old 'meet' guess came from the legacy tab branch and was simply wrong
    // on brackets.
    expect(useUiStore.getState().activeTournamentKind).toBeNull();
  });

  it('rejects renderer tab names as routes', () => {
    mountAt('/tournaments/t1/bracket-roster');
    expect(useUiStore.getState().activeTab).toBe('setup');
  });
});
