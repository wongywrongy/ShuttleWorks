/**
 * Regression tests for `tournamentStore` NON_SCHEDULING_KEYS — Task 6 fix.
 *
 * Verifies that setConfig() on display-only fields (standingsMode, tv*) does NOT
 * mark the schedule stale or trip the lock guard. These are pure UI/render-path
 * fields, never solver inputs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTournamentStore } from '../tournamentStore';
import type { TournamentConfig } from '../../api/dto';

const get = () => useTournamentStore.getState();

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    intervalMinutes: 15,
    dayStart: '09:00',
    dayEnd: '17:00',
    breaks: [],
    courtCount: 2,
    defaultRestMinutes: 30,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
    closedCourts: [],
    courtClosures: [],
    clockShiftMinutes: 0,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset store to initial state for test isolation.
  useTournamentStore.setState({
    config: makeConfig(),
    scheduleIsStale: false,
  });
});

describe('tournamentStore — NON_SCHEDULING_KEYS (display-only fields)', () => {
  it('changing standingsMode does NOT mark schedule stale', () => {
    const config = makeConfig({ standingsMode: 'off' });
    get().setConfig(config);
    expect(get().scheduleIsStale).toBe(false);

    // Now change standingsMode to 'side'
    get().setConfig(makeConfig({ standingsMode: 'side' }));
    expect(get().scheduleIsStale).toBe(false);

    // And again to 'rotate'
    get().setConfig(makeConfig({ standingsMode: 'rotate' }));
    expect(get().scheduleIsStale).toBe(false);
  });

  it('changing tvDisplayMode does NOT mark schedule stale', () => {
    const config = makeConfig({ tvDisplayMode: 'strip' });
    get().setConfig(config);
    expect(get().scheduleIsStale).toBe(false);

    get().setConfig(makeConfig({ tvDisplayMode: 'grid' }));
    expect(get().scheduleIsStale).toBe(false);
  });

  it('changing scoringFormat does NOT mark schedule stale', () => {
    const config = makeConfig({ scoringFormat: 'simple' });
    get().setConfig(config);
    expect(get().scheduleIsStale).toBe(false);

    get().setConfig(makeConfig({ scoringFormat: 'badminton' }));
    expect(get().scheduleIsStale).toBe(false);
  });

  it('changing a scheduling field DOES mark schedule stale', () => {
    const config = makeConfig({ courtCount: 2 });
    get().setConfig(config);
    expect(get().scheduleIsStale).toBe(false);

    // Change a real scheduling field (courtCount)
    get().setConfig(makeConfig({ courtCount: 3 }));
    expect(get().scheduleIsStale).toBe(true);
  });

  it('changing standingsMode alone does not stale an already-stale schedule', () => {
    const config = makeConfig({ courtCount: 3 });
    get().setConfig(config);
    expect(get().scheduleIsStale).toBe(true);

    // Now change standingsMode (display-only)
    get().setConfig(makeConfig({ courtCount: 3, standingsMode: 'side' }));
    // Should remain stale because courtCount was changed; we only avoid marking it
    // stale if ONLY display fields changed.
    expect(get().scheduleIsStale).toBe(true);
  });

  // Task 7: courtOrder/hiddenCourts are presentation-only (board arrangement),
  // same class of field as standingsMode/tv* above — never solver input.
  it('changing courtOrder does NOT mark schedule stale', () => {
    const config = makeConfig({ courtOrder: [2, 1] });
    get().setConfig(config);
    expect(get().scheduleIsStale).toBe(false);

    get().setConfig(makeConfig({ courtOrder: [1, 2] }));
    expect(get().scheduleIsStale).toBe(false);
  });

  it('changing hiddenCourts does NOT mark schedule stale', () => {
    const config = makeConfig({ hiddenCourts: [2] });
    get().setConfig(config);
    expect(get().scheduleIsStale).toBe(false);

    get().setConfig(makeConfig({ hiddenCourts: [] }));
    expect(get().scheduleIsStale).toBe(false);
  });
});
