/**
 * Tab clicks must update both the active-tab store AND the URL.
 *
 * Today TabBar only sets activeTab; the URL stays at whatever segment
 * the operator deep-linked to. After this bundle, clicking a tab
 * navigates to /tournaments/:id/<tab.id> with replace semantics so
 * refresh + share work and the back button doesn't accumulate.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TabBar } from '../../app/TabBar';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';

/** Renders TabBar mounted under /tournaments/t1/<initialSeg>. The
 *  LocationProbe writes the current path into a ref the test reads. */
function renderTabBar(initialSeg: string, locationRef: { current: string }) {
  function LocationProbe() {
    const loc = useLocation();
    locationRef.current = loc.pathname;
    return null;
  }
  return render(
    <MemoryRouter initialEntries={[`/tournaments/t1/${initialSeg}`]}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={
            <>
              <TabBar />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Reset stores to a known meet-kind tournament with at least one
  // player + one match so no meet tabs are disabled.
  useUiStore.setState({
    activeTab: 'setup',
    activeTournamentKind: 'meet',
    activeTournamentId: 't1',
    bracketDataReady: false,
  });
  useTournamentStore.setState({
    players: [{ id: 'p1', name: 'A', schoolId: 's1', gender: 'M' } as never],
    matches: [{ id: 'm1' } as never],
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      courtCount: 4,
      restBetweenRounds: 0,
      breaks: [],
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      tournamentName: 'Test',
    },
  });
});

describe('<TabBar /> URL sync', () => {
  it('clicking a meet tab navigates to /tournaments/:id/<tab>', () => {
    const loc = { current: '' };
    renderTabBar('setup', loc);
    fireEvent.click(screen.getByTestId('tab-roster'));
    expect(loc.current).toBe('/tournaments/t1/roster');
  });

  it('clicking a meet tab also calls setActiveTab in the store', () => {
    const loc = { current: '' };
    renderTabBar('setup', loc);
    fireEvent.click(screen.getByTestId('tab-matches'));
    expect(useUiStore.getState().activeTab).toBe('matches');
  });

  it('clicking a bracket tab navigates to /tournaments/:id/<bracket-tab>', () => {
    useUiStore.setState({
      activeTab: 'bracket-setup',
      activeTournamentKind: 'bracket',
      bracketDataReady: true,
    });
    const loc = { current: '' };
    renderTabBar('bracket-setup', loc);
    fireEvent.click(screen.getByTestId('tab-bracket-roster'));
    expect(loc.current).toBe('/tournaments/t1/bracket-roster');
    expect(useUiStore.getState().activeTab).toBe('bracket-roster');
  });

  it('clicking a disabled tab is a no-op (no navigate, no setActiveTab)', () => {
    // Schedule is disabled when matches.length === 0
    useTournamentStore.setState({ matches: [] });
    const loc = { current: '' };
    renderTabBar('setup', loc);
    const scheduleTab = screen.getByTestId('tab-schedule');
    fireEvent.click(scheduleTab);
    expect(loc.current).toBe('/tournaments/t1/setup'); // unchanged
    expect(useUiStore.getState().activeTab).toBe('setup'); // unchanged
  });
});
