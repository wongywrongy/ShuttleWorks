import { describe, it, expect } from 'vitest';
import { nextActionFor, rowActionFor } from '../nextAction';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t = (reason?: string): TournamentSummaryDTO => ({
  id: 'x', name: 'X', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
  signals: reason
    ? { health: 'attention', attention: [{ code: reason, label: 'l' }], modules: { enabled: 1, available: 0, disabled: 0, comingSoon: 0 }, setup: {}, collaboration: { memberCount: 0, activeInviteCount: 0 } }
    : undefined,
});

describe('nextActionFor', () => {
  it('maps the first attention reason to an action label', () => {
    expect(nextActionFor(t('NO_ROSTER')).label).toBe('Add players');
    expect(nextActionFor(t('NOT_SCHEDULED')).label).toBe('Generate schedule');
    expect(nextActionFor(t('NO_BRACKET')).label).toBe('Build the bracket');
  });
  it('defaults to Open with no reason', () => {
    expect(nextActionFor(t())).toEqual({ label: 'Open', reasonCode: null });
  });

  it('routes attention actions to the canonical workflow destination', () => {
    expect(rowActionFor(t('NO_ROSTER'), 'upcoming').segment).toBe('participants/people');
    expect(rowActionFor(t('NOT_SCHEDULED'), 'upcoming').segment).toBe('operations/plan');
    expect(rowActionFor(t('NO_BRACKET'), 'upcoming').segment).toBe('bracket/draws');
  });
});

describe('rowActionFor', () => {
  it('opens completed and past bracket workspaces on their draw directory', () => {
    const bracket = {
      ...t(),
      kind: 'bracket' as const,
      tournamentDate: '2026-01-01',
      signals: {
        health: 'good' as const,
        attention: [],
        phase: 'complete' as const,
        modules: { enabled: 1, available: 0, disabled: 0, comingSoon: 0 },
        setup: {},
        collaboration: { memberCount: 0, activeInviteCount: 0 },
      },
    };
    expect(rowActionFor(bracket, 'upcoming')).toEqual({
      label: 'View draws',
      kind: 'results',
      segment: 'bracket/draws',
    });
    expect(rowActionFor({ ...bracket, signals: undefined }, 'past')).toEqual({
      label: 'View draws',
      kind: 'results',
      segment: 'bracket/draws',
    });
  });
});

// V3-OC02.2: an unresolved entries reason must route to the entries desk,
// not to "View draws"/"View results" — those open nothing that helps.
describe('rowActionFor — entries attention (V3-OC02.2)', () => {
  const complete = (reason: string): TournamentSummaryDTO => ({
    id: 'x', name: 'X', status: 'active', kind: 'bracket', tournamentDate: '2026-01-01',
    createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
    signals: {
      health: 'attention',
      attention: [{ code: reason, label: 'l' }],
      phase: 'complete',
      modules: { enabled: 1, available: 0, disabled: 0, comingSoon: 0 },
      setup: {},
      collaboration: { memberCount: 0, activeInviteCount: 0 },
    },
  });

  it('overrides "View draws" with "Review entries" for a completed bracket with an entries reason', () => {
    expect(rowActionFor(complete('ENTRIES_NOT_COMMITTED'), 'upcoming')).toEqual({
      label: 'Review entries',
      kind: 'open',
      segment: 'participants/entries',
    });
  });

  it('overrides the "past" fallback the same way', () => {
    expect(rowActionFor(complete('UNPAID_ENTRIES'), 'past')).toEqual({
      label: 'Review entries',
      kind: 'open',
      segment: 'participants/entries',
    });
  });

  it('leaves non-entries reasons alone (View draws still applies)', () => {
    expect(rowActionFor(complete('NO_ROSTER'), 'past').label).toBe('View draws');
  });

  it('never links to entries when the catalog disables the cloud-only module', () => {
    const disabled = {
      ...complete('ENTRIES_NOT_COMMITTED'),
      modules: [
        { moduleId: 'bracket' as const, status: 'enabled' as const, config: null },
        { moduleId: 'entries' as const, status: 'disabled' as const, config: null },
      ],
    };
    expect(rowActionFor(disabled, 'upcoming').segment).not.toBe('participants/entries');
  });

  it('lets real playing metrics outrank a stale entries review phase', () => {
    const stale = {
      ...complete('ENTRIES_NOT_COMMITTED'),
      modules: [{ moduleId: 'entries' as const, status: 'disabled' as const, config: null }],
      signals: {
        ...complete('ENTRIES_NOT_COMMITTED').signals!,
        phase: 'entries_review' as const,
        matches: { total: 10, scheduled: 2, toDo: 0, played: 6, playing: 2 },
      },
    };
    expect(rowActionFor(stale, 'upcoming')).toMatchObject({ label: 'Open live day', segment: 'operations/live' });
  });

  it('does not call a partially played workspace complete', () => {
    const partial = {
      ...complete('ENTRIES_NOT_COMMITTED'),
      modules: [{ moduleId: 'bracket' as const, status: 'enabled' as const, config: null }],
      signals: {
        ...complete('ENTRIES_NOT_COMMITTED').signals!,
        phase: 'entries_review' as const,
        matches: { total: 10, scheduled: 2, toDo: 0, played: 6, playing: 0 },
      },
    };
    expect(rowActionFor(partial, 'upcoming')).toMatchObject({ label: 'Open workspace' });
  });

  it('treats a catalog without an entries row as entries-disabled', () => {
    const local = {
      ...complete('ENTRIES_NOT_COMMITTED'),
      modules: [{ moduleId: 'bracket' as const, status: 'enabled' as const, config: null }],
    };
    expect(rowActionFor(local, 'upcoming').segment).not.toBe('participants/entries');
  });
});
