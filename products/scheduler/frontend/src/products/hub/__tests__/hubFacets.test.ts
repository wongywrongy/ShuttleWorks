import { describe, it, expect } from 'vitest';
import { HUB_FACETS, isShared, matchesFacet, facetCounts } from '../hubFacets';
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
  it('the strip lists the five prototype facets in order', () => {
    expect(HUB_FACETS.map((f) => f.id)).toEqual([
      'all',
      'active',
      'draft',
      'shared',
      'attention',
    ]);
  });

  it('all matches everything; active/draft split on status', () => {
    const active = ws({ status: 'active' });
    const draft = ws({ status: 'draft' });
    const archived = ws({ status: 'archived' });
    expect(matchesFacet(active, 'all')).toBe(true);
    expect(matchesFacet(archived, 'all')).toBe(true);
    expect(matchesFacet(active, 'active')).toBe(true);
    expect(matchesFacet(draft, 'active')).toBe(false);
    expect(matchesFacet(draft, 'draft')).toBe(true);
    // Archived is neither active nor draft — it only appears under "All".
    expect(matchesFacet(archived, 'active')).toBe(false);
    expect(matchesFacet(archived, 'draft')).toBe(false);
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
      ws({ id: 'a', status: 'active', role: 'operator' }), // active + shared
      ws({ id: 'b', status: 'draft', role: 'owner' }), // draft + attention (fallback)
      ws({ id: 'c', status: 'archived', role: 'owner' }), // all only
    ];
    const c = facetCounts(list);
    expect(c.all).toBe(3);
    expect(c.active).toBe(1);
    expect(c.draft).toBe(1);
    expect(c.shared).toBe(1);
    expect(c.attention).toBe(1);
  });
});
