import { describe, it, expect } from 'vitest';
import { nextActionFor } from '../nextAction';
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
});
