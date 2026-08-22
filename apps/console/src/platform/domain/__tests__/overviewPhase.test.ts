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

  it('falls back to the four PLAY phases when the payload carries no module catalog', () => {
    // Unchanged in substance: this always meant "assume the engine, show the
    // lifecycle". E4 added three phases that exist only where Entries does,
    // and a catalog we cannot read is not evidence that it does — so the
    // fallback is the four, not the seven. The alternative would put three
    // steps in the stepper that the workspace may never be able to reach.
    expect(visiblePhases(ws({ modules: undefined }))).toEqual([
      'setup',
      'ready',
      'live',
      'complete',
    ]);
  });

  it('shows the entries phases only where the Entries module is enabled', () => {
    const withEntries = ws({
      modules: [
        { moduleId: 'meet', status: 'enabled', config: null },
        { moduleId: 'entries', status: 'enabled', config: null },
      ],
    });
    expect(visiblePhases(withEntries)).toEqual([...KNOWN_PHASES]);
  });

  it('hides them again when Entries is present but not enabled', () => {
    // NEGATIVE CONTROL for the gate. Without the status test, a workspace
    // that merely has Entries in its catalog — every cloud workspace —
    // acquires three lifecycle steps it does not take.
    const available = ws({
      modules: [
        { moduleId: 'meet', status: 'enabled', config: null },
        { moduleId: 'entries', status: 'available', config: null },
      ],
    });
    expect(visiblePhases(available)).toEqual(['setup', 'ready', 'live', 'complete']);
  });

  it('returns nothing for a null summary', () => {
    expect(visiblePhases(null)).toEqual([]);
  });
});

describe('phaseIndex', () => {
  it('locates a phase for the stepper done/current split', () => {
    // 5, not 2: E4 put three entries phases in front of `setup`. The
    // stepper reads this index against the phases it was GIVEN, which is
    // why the assertion moves rather than the function.
    expect(phaseIndex(KNOWN_PHASES, 'live')).toBe(5);
  });

  it('returns -1 when the phase is not shown', () => {
    expect(phaseIndex([], 'live')).toBe(-1);
  });
});
