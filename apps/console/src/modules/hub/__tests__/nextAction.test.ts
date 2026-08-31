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
    expect(rowActionFor(t('NO_BRACKET'), 'upcoming').segment).toBe('competition/draws');
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
      segment: 'competition/draws',
    });
    expect(rowActionFor({ ...bracket, signals: undefined }, 'past')).toEqual({
      label: 'View draws',
      kind: 'results',
      segment: 'competition/draws',
    });
  });
});
