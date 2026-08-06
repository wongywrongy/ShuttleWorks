import { describe, it, expect } from 'vitest';
import type { TournamentSummaryDTO, WorkspaceSignalsDTO } from '../../../api/dto';
import { buildChecklist, checklistProgress, setupLabel, stepTarget } from '../setupChecklist';

const sig = (over: Partial<WorkspaceSignalsDTO> = {}): WorkspaceSignalsDTO => ({
  health: 'attention',
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
  ...over,
});

describe('buildChecklist', () => {
  it('returns nothing when signals are absent (older payloads)', () => {
    expect(buildChecklist(ws({ signals: undefined }))).toEqual([]);
    expect(buildChecklist(null)).toEqual([]);
  });

  it('orders meet steps canonically, not by dict insertion order', () => {
    const scrambled = sig({
      setup: { results: false, scheduled: false, configured: true, roster: false },
    });
    expect(buildChecklist(ws({ signals: scrambled })).map((s) => s.key)).toEqual([
      'configured',
      'roster',
      'scheduled',
      'results',
    ]);
  });

  it('orders bracket steps canonically', () => {
    const b = sig({ setup: { results: false, bracketBuilt: false, events: true } });
    const steps = buildChecklist(ws({ kind: 'bracket', signals: b }));
    expect(steps.map((s) => s.key)).toEqual(['events', 'bracketBuilt', 'results']);
  });

  // The merge: readiness + attention were two lists stating one fact set.
  it('folds the attention copy into the matching step as its reason', () => {
    const s = sig({
      setup: { configured: true, roster: false, scheduled: false, results: false },
      attention: [
        { code: 'NO_ROSTER', label: 'No players added yet' },
        { code: 'NOT_SCHEDULED', label: 'Schedule not generated' },
      ],
    });
    const steps = buildChecklist(ws({ signals: s }));
    const roster = steps.find((x) => x.key === 'roster')!;
    expect(roster.reason).toBe('No players added yet');
    expect(roster.done).toBe(false);
  });

  it('gives the first incomplete step an action routed to the fixing surface', () => {
    const s = sig({
      setup: { configured: true, roster: false, scheduled: false, results: false },
      attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }],
    });
    const roster = buildChecklist(ws({ signals: s })).find((x) => x.key === 'roster')!;
    expect(roster.action).toEqual({ label: 'Add players', segment: 'roster' });
  });

  it('routes bracket steps to the bracket surfaces', () => {
    const s = sig({ setup: { events: true, bracketBuilt: false, results: false } });
    const built = buildChecklist(ws({ kind: 'bracket', signals: s })).find(
      (x) => x.key === 'bracketBuilt',
    )!;
    expect(built.action?.segment).toBe('bracket-draws');
  });

  // Sequence legibility: later incomplete steps stay visible but must not
  // invite a click onto a surface the operator cannot use yet.
  it('marks later incomplete steps blocked, with no action', () => {
    const s = sig({
      setup: { configured: true, roster: false, scheduled: false, results: false },
    });
    const steps = buildChecklist(ws({ signals: s }));
    expect(steps.find((x) => x.key === 'roster')!.blocked).toBe(false);
    const scheduled = steps.find((x) => x.key === 'scheduled')!;
    expect(scheduled.blocked).toBe(true);
    expect(scheduled.action).toBeNull();
  });

  it('gives completed steps no reason and no action', () => {
    const s = sig({
      setup: { configured: true, roster: true, scheduled: true, results: true },
      attention: [{ code: 'NO_ROSTER', label: 'stale reason' }],
    });
    for (const step of buildChecklist(ws({ signals: s }))) {
      expect(step.done).toBe(true);
      expect(step.reason).toBeNull();
      expect(step.action).toBeNull();
    }
  });

  it('still renders a setup key the client has never heard of', () => {
    const s = sig({ setup: { configured: true, entriesClosed: false } });
    const steps = buildChecklist(ws({ signals: s }));
    expect(steps.map((x) => x.key)).toContain('entriesClosed');
    expect(steps.find((x) => x.key === 'entriesClosed')!.label).toBe('entries Closed');
  });
});

describe('checklistProgress', () => {
  it('counts ready over total', () => {
    const s = sig({ setup: { configured: true, roster: true, scheduled: false, results: false } });
    expect(checklistProgress(buildChecklist(ws({ signals: s })))).toEqual({ ready: 2, total: 4 });
  });

  it('is null with no steps', () => {
    expect(checklistProgress([])).toBeNull();
  });
});

describe('setupLabel / stepTarget', () => {
  it('splits camelCase keys into words', () => {
    expect(setupLabel('bracketBuilt')).toBe('bracket Built');
  });

  it('routes by kind', () => {
    expect(stepTarget('roster', 'meet')).toBe('roster');
    expect(stepTarget('roster', 'bracket')).toBe('bracket-roster');
    expect(stepTarget('scheduled', 'meet')).toBe('schedule');
    expect(stepTarget('nonsense', 'meet')).toBeNull();
  });
});
