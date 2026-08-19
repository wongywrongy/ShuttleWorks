import { describe, it, expect } from 'vitest';
import {
  HUB_FACETS,
  isShared,
  matchesFacet,
  facetCounts,
  lifecycleFacetOf,
  type HubFacetId,
} from '../hubFacets';
import type { TournamentSummaryDTO } from '../../../api/dto';

function ws(over: Partial<TournamentSummaryDTO>): TournamentSummaryDTO {
  return {
    id: 'id',
    name: 'name',
    kind: 'meet',
    role: 'owner',
    status: 'draft',
    tournamentDate: null,
    createdAt: '',
    updatedAt: '',
    ownerName: null,
    ...over,
  } as TournamentSummaryDTO;
}

describe('hubFacets', () => {
  /** Signals carrying a lifecycle phase. */
  const phased = (phase: 'setup' | 'ready' | 'live' | 'complete') => ({
    health: 'good' as const,
    attention: [],
    modules: { enabled: 1, available: 0, disabled: 0, comingSoon: 0 },
    setup: {},
    collaboration: { memberCount: 1, activeInviteCount: 0 },
    phase,
  });

  it('the strip lists the lifecycle facets in travel order, then the cross-cutting ones', () => {
    expect(HUB_FACETS.map((f) => f.id)).toEqual([
      'all',
      'setup',
      'ready',
      'live',
      'complete',
      'shared',
      'attention',
      'archived',
    ]);
  });

  // The point of the change: the strip used to split on the operator-managed
  // `status` column, so a mid-play tournament filed under "Draft" while every
  // other surface said "Live".
  it('lifecycle facets read the derived phase, not the status column', () => {
    const live = ws({ status: 'draft', signals: phased('live') });
    expect(matchesFacet(live, 'live')).toBe(true);
    expect(matchesFacet(live, 'setup')).toBe(false);

    const ready = ws({ status: 'active', signals: phased('ready') });
    expect(matchesFacet(ready, 'ready')).toBe(true);
    expect(matchesFacet(ready, 'live')).toBe(false);
  });

  it('all matches everything, including archived', () => {
    expect(matchesFacet(ws({ status: 'active' }), 'all')).toBe(true);
    expect(matchesFacet(ws({ status: 'archived' }), 'all')).toBe(true);
  });

  // Match rows persist, so an archived tournament keeps phase live/complete
  // forever. Same precedence as platform/domain/lifecycle.ts.
  it('archived outranks the phase — an archived event never sits under Live', () => {
    const archivedLive = ws({ status: 'archived', signals: phased('live') });
    expect(matchesFacet(archivedLive, 'archived')).toBe(true);
    expect(matchesFacet(archivedLive, 'live')).toBe(false);
    expect(matchesFacet(archivedLive, 'complete')).toBe(false);
  });

  it('a payload with no phase falls back to Setup rather than vanishing', () => {
    const legacy = ws({ status: 'draft', signals: undefined });
    expect(matchesFacet(legacy, 'setup')).toBe(true);
    expect(lifecycleFacetOf(legacy)).toBe('setup');
  });

  it('the lifecycle facets partition the list — every row lands in exactly one', () => {
    const rows = [
      ws({ id: 'a', signals: phased('setup') }),
      ws({ id: 'b', signals: phased('ready') }),
      ws({ id: 'c', signals: phased('live') }),
      ws({ id: 'd', signals: phased('complete') }),
      ws({ id: 'e', status: 'archived', signals: phased('live') }),
    ];
    const lifecycle: HubFacetId[] = ['setup', 'ready', 'live', 'complete', 'archived'];
    for (const row of rows) {
      expect(lifecycle.filter((f) => matchesFacet(row, f))).toHaveLength(1);
    }
  });

  it('shared = a non-owner role, or an owner with members/invites', () => {
    expect(isShared(ws({ role: 'operator' }))).toBe(true);
    expect(isShared(ws({ role: 'viewer' }))).toBe(true);
    expect(isShared(ws({ role: 'owner' }))).toBe(false);
    expect(
      isShared(
        ws({
          role: 'owner',
          signals: {
            health: 'good',
            attention: [],
            modules: { enabled: 0, available: 0, disabled: 0, comingSoon: 0 },
            setup: {},
            collaboration: { memberCount: 2, activeInviteCount: 0 },
          },
        }),
      ),
    ).toBe(true);
    expect(
      isShared(
        ws({
          role: 'owner',
          signals: {
            health: 'good',
            attention: [],
            modules: { enabled: 0, available: 0, disabled: 0, comingSoon: 0 },
            setup: {},
            collaboration: { memberCount: 1, activeInviteCount: 1 },
          },
        }),
      ),
    ).toBe(true);
  });

  it('attention uses the signals (any reason) or the draft-owner fallback', () => {
    const withReason = ws({
      role: 'operator',
      status: 'active',
      signals: {
        health: 'good',
        attention: [{ code: 'NO_ROSTER', label: 'No players' }],
        modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 0 },
        setup: {},
        collaboration: { memberCount: 1, activeInviteCount: 0 },
      },
    });
    expect(matchesFacet(withReason, 'attention')).toBe(true);
    // No signals + owner + draft → the legacy attention fallback fires.
    expect(matchesFacet(ws({ role: 'owner', status: 'draft' }), 'attention')).toBe(true);
    expect(matchesFacet(ws({ role: 'owner', status: 'active' }), 'attention')).toBe(false);
  });

  it('facetCounts tallies overlapping facets (a row counts under each it matches)', () => {
    const list = [
      ws({ id: 'a', status: 'active', role: 'operator', signals: phased('live') }), // live + shared
      ws({ id: 'b', status: 'draft', role: 'owner' }), // setup + attention (fallback)
      ws({ id: 'c', status: 'archived', role: 'owner', signals: phased('complete') }), // archived
    ];
    const c = facetCounts(list);
    expect(c.all).toBe(3);
    expect(c.live).toBe(1);
    expect(c.setup).toBe(1);
    expect(c.archived).toBe(1);
    // Archived does NOT also tally under complete.
    expect(c.complete).toBe(0);
    expect(c.shared).toBe(1);
    expect(c.attention).toBe(1);
  });
});
