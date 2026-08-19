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
    // A draft nobody owns has nothing to act on — it stays a draft. (The
    // owner+draft case is the attention fallback; see the harmony suite.)
    expect(workspaceHealth(base({ signals: undefined, status: 'draft', role: 'viewer' }))).toBe('draft');
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

/**
 * The Hub's "Needs attention 3" lit no row amber (2026-08-11 design audit,
 * T4). `needsAttention` reads the attention reasons; `workspaceHealth`
 * returned `signals.health`, which the backend resolves from `status ===
 * 'draft'` BEFORE it looks at those reasons — so a draft workspace with two
 * open setup steps was counted, filtered, and drawn grey.
 *
 * The count, the filter and the dot are three renderings of one fact, so they
 * agree by construction now: attention outranks draft, archived outranks
 * attention (the precedence hubFacets already applies).
 */
describe('the row dot agrees with the count above it', () => {
  const cases: [string, TournamentSummaryDTO][] = [
    [
      'draft + open setup steps (the reported case)',
      base({
        status: 'draft',
        signals: signals({ health: 'draft', attention: [{ code: 'NO_ROSTER', label: 'x' }] }),
      }),
    ],
    ['health: attention', base({ signals: signals({ health: 'attention' }) })],
    ['good, nothing open', base({ signals: signals() })],
    ['legacy payload: an owner draft', base({ signals: undefined, status: 'draft' })],
    ['legacy payload: an active workspace', base({ signals: undefined, status: 'active' })],
  ];

  it.each(cases)('%s', (_label, t) => {
    expect(workspaceHealth(t) === 'attention').toBe(needsAttention(t));
  });

  it('archived still outranks it — an old event does not shout', () => {
    const t = base({
      status: 'archived',
      signals: signals({ health: 'archived', attention: [{ code: 'NO_ROSTER', label: 'x' }] }),
    });
    expect(workspaceHealth(t)).toBe('archived');
  });
});
