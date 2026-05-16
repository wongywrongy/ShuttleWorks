/**
 * URL → store sync for the per-tournament shell.
 *
 * After Bundle 3 the URL trailing segment is the tab id 1:1. Mounting
 * at /tournaments/:id/bracket-roster sets activeTab = 'bracket-roster'
 * (no longer translated through the legacy 'bracket' sentinel).
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
  it('sets activeTab = "bracket-roster" when mounted at /bracket-roster', () => {
    mountAt('/tournaments/t1/bracket-roster');
    expect(useUiStore.getState().activeTab).toBe('bracket-roster');
    expect(useUiStore.getState().activeTournamentKind).toBe('bracket');
  });

  it('sets activeTab = "bracket-events" when mounted at /bracket-events', () => {
    mountAt('/tournaments/t1/bracket-events');
    expect(useUiStore.getState().activeTab).toBe('bracket-events');
    expect(useUiStore.getState().activeTournamentKind).toBe('bracket');
  });

  it('sets activeTab = "setup" when mounted at /setup', () => {
    mountAt('/tournaments/t1/setup');
    expect(useUiStore.getState().activeTab).toBe('setup');
    expect(useUiStore.getState().activeTournamentKind).toBe('meet');
  });

  it('sets activeTab = "tv" when mounted at /tv', () => {
    mountAt('/tournaments/t1/tv');
    expect(useUiStore.getState().activeTab).toBe('tv');
    expect(useUiStore.getState().activeTournamentKind).toBe('meet');
  });
});
