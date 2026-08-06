import { describe, it, expect } from 'vitest';
import type { TournamentSummaryDTO, WorkspaceSignalsDTO } from '../../../api/dto';
import { resolvePhase, visiblePhases, phaseIndex, KNOWN_PHASES } from '../overviewPhase';

const sig = (over: Partial<WorkspaceSignalsDTO> = {}): WorkspaceSignalsDTO => ({
  health: 'good',
  attention: [],
  modules: { enabled: 1, available: 0, disabled: 0, comingSoon: 0 },
  setup: {},
  collaboration: { memberCount: 1, activeInviteCount: 0 },
  ...over,
});

const ws = (over: Partial<TournamentSummaryDTO> = {}): TournamentSummaryDTO => ({
  id: 't1',
  name: 'Spring',
  status: 'active',
  kind: 'meet',
  tournamentDate: '2026-07-01',
  createdAt: '',
  updatedAt: '',
  role: 'owner',
  ownerName: null,
  modules: [{ moduleId: 'meet', status: 'enabled', config: null }],
  ...over,
});

describe('resolvePhase', () => {
  it('passes through each known phase', () => {
    for (const p of KNOWN_PHASES) {
      expect(resolvePhase(ws({ signals: sig({ phase: p }) }))).toBe(p);
    }
  });

  it('defaults to setup when signals are absent entirely', () => {
    expect(resolvePhase(ws({ signals: undefined }))).toBe('setup');
  });

  it('defaults to setup when phase is missing from an older payload', () => {
    expect(resolvePhase(ws({ signals: sig() }))).toBe('setup');
  });

  it('defaults to setup for a null summary', () => {
    expect(resolvePhase(null)).toBe('setup');
  });

  // THE seam guarantee: a newer backend may emit a phase this build has never
  // heard of. It must render the safe default panel, never crash.
  it('defaults to setup for an unknown phase value', () => {
    const future = sig({ phase: 'entries-open' as never });
    expect(resolvePhase(ws({ signals: future }))).toBe('setup');
  });

  it('defaults to setup for a non-string phase value', () => {
    expect(resolvePhase(ws({ signals: sig({ phase: 7 as never }) }))).toBe('setup');
  });
});

describe('visiblePhases', () => {
  it('shows the full lifecycle for a workspace with an enabled engine', () => {
    expect(visiblePhases(ws())).toEqual(['setup', 'ready', 'live', 'complete']);
  });

  it('shows nothing for a workspace with no engine enabled yet', () => {
    const noEngine = ws({
      modules: [{ moduleId: 'display', status: 'enabled', config: null }],
    });
    expect(visiblePhases(noEngine)).toEqual([]);
  });

  it('falls back to the full lifecycle when the payload carries no module catalog', () => {
    expect(visiblePhases(ws({ modules: undefined }))).toEqual([...KNOWN_PHASES]);
  });

  it('returns nothing for a null summary', () => {
    expect(visiblePhases(null)).toEqual([]);
  });
});

describe('phaseIndex', () => {
  it('locates a phase for the stepper done/current split', () => {
    expect(phaseIndex(KNOWN_PHASES, 'live')).toBe(2);
  });

  it('returns -1 when the phase is not shown', () => {
    expect(phaseIndex([], 'live')).toBe(-1);
  });
});
