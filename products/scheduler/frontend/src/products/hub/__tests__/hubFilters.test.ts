import { describe, it, expect } from 'vitest';
import { filterWorkspaces, filterCounts } from '../hubFilters';
import type { TournamentSummaryDTO } from '../../../api/dto';

const make = (over: Partial<TournamentSummaryDTO>): TournamentSummaryDTO => ({
  id: 'x',
  name: 'X',
  status: 'draft',
  kind: 'meet',
  tournamentDate: null,
  createdAt: '',
  updatedAt: '',
  role: 'owner',
  ownerName: null,
  ...over,
});

const list = [
  make({ id: 'a', name: 'Alpha', status: 'active', role: 'owner' }),
  make({ id: 'b', name: 'Beta', status: 'draft', role: 'owner' }),
  make({ id: 'c', name: 'Gamma', status: 'draft', role: 'viewer' }),
];

describe('hubFilters', () => {
  it('computes per-tab counts', () => {
    const c = filterCounts(list);
    expect(c.all).toBe(3);
    expect(c.active).toBe(1);
    expect(c.draft).toBe(2);
    expect(c.shared).toBe(1); // role !== owner (Gamma)
    expect(c.attention).toBe(1); // owned + draft (Beta only — Gamma is a viewer)
  });

  it('filters by tab', () => {
    expect(filterWorkspaces(list, 'active', '').map((t) => t.id)).toEqual(['a']);
    expect(filterWorkspaces(list, 'shared', '').map((t) => t.id)).toEqual(['c']);
    expect(filterWorkspaces(list, 'attention', '').map((t) => t.id)).toEqual(['b']);
    expect(filterWorkspaces(list, 'all', '')).toHaveLength(3);
  });

  it('filters by name query (case-insensitive substring), combined with tab', () => {
    expect(filterWorkspaces(list, 'all', 'alph').map((t) => t.id)).toEqual(['a']);
    expect(filterWorkspaces(list, 'draft', 'gam').map((t) => t.id)).toEqual(['c']);
    expect(filterWorkspaces(list, 'all', 'zzz')).toHaveLength(0);
  });

  it('Needs-attention uses signals when present (an active workspace can need attention)', () => {
    const withSignals = [
      // Active + signals.health 'attention' → attention (the old draft-only rule would miss it).
      make({
        id: 'd',
        name: 'Delta',
        status: 'active',
        role: 'owner',
        signals: {
          health: 'attention',
          attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }],
          modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 },
          setup: { roster: false },
          collaboration: { memberCount: 1, activeInviteCount: 0 },
        },
      }),
      // Active + healthy signals → NOT attention.
      make({
        id: 'e',
        name: 'Echo',
        status: 'active',
        role: 'owner',
        signals: {
          health: 'good',
          attention: [],
          modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 },
          setup: { roster: true },
          collaboration: { memberCount: 1, activeInviteCount: 0 },
        },
      }),
    ];
    expect(filterCounts(withSignals).attention).toBe(1);
    expect(filterWorkspaces(withSignals, 'attention', '').map((t) => t.id)).toEqual(['d']);
  });
});
