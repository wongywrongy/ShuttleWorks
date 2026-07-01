import { describe, it, expect } from 'vitest';
import {
  workspaceHealth,
  attentionReasons,
  needsAttention,
  readinessOf,
  moduleCountsOf,
  collaborationOf,
} from '../hubSignals';
import type { TournamentSummaryDTO, WorkspaceSignalsDTO } from '../../../api/dto';

const base = (over: Partial<TournamentSummaryDTO> = {}): TournamentSummaryDTO => ({
  id: 't1',
  name: 'WS',
  status: 'active',
  kind: 'meet',
  tournamentDate: null,
  createdAt: '',
  updatedAt: '',
  role: 'owner',
  ownerName: null,
  ...over,
});

const signals = (over: Partial<WorkspaceSignalsDTO> = {}): WorkspaceSignalsDTO => ({
  health: 'good',
  attention: [],
  modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 },
  setup: { roster: true, scheduled: false },
  collaboration: { memberCount: 2, activeInviteCount: 1 },
  ...over,
});

describe('hubSignals', () => {
  it('workspaceHealth prefers signals, falls back to status', () => {
    expect(workspaceHealth(base({ signals: signals({ health: 'attention' }) }))).toBe('attention');
    expect(workspaceHealth(base({ signals: undefined, status: 'draft' }))).toBe('draft');
    expect(workspaceHealth(base({ signals: undefined, status: 'active' }))).toBe('good');
  });

  it('needsAttention uses signals (health/attention), else owner+draft fallback', () => {
    expect(needsAttention(base({ signals: signals({ health: 'attention' }) }))).toBe(true);
    expect(
      needsAttention(base({ signals: signals({ attention: [{ code: 'NO_ROSTER', label: 'x' }] }) })),
    ).toBe(true);
    expect(needsAttention(base({ signals: signals() }))).toBe(false); // good + no reasons
    // fallback (no signals)
    expect(needsAttention(base({ signals: undefined, role: 'owner', status: 'draft' }))).toBe(true);
    expect(needsAttention(base({ signals: undefined, role: 'owner', status: 'active' }))).toBe(false);
  });

  it('attentionReasons / readiness / counts derive from signals (null when absent)', () => {
    const t = base({ signals: signals({ attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }] }) });
    expect(attentionReasons(t).map((a) => a.label)).toEqual(['No players added yet']);
    expect(readinessOf(t)).toEqual({ ready: 1, total: 2 });
    expect(moduleCountsOf(t)).toEqual({ enabled: 1, available: 1 });
    expect(collaborationOf(t)).toEqual({ memberCount: 2, activeInviteCount: 1 });
    const noSig = base({ signals: undefined });
    expect(attentionReasons(noSig)).toEqual([]);
    expect(readinessOf(noSig)).toBeNull();
    expect(moduleCountsOf(noSig)).toBeNull();
    expect(collaborationOf(noSig)).toBeNull();
  });
});
