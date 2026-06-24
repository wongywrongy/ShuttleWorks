import { describe, it, expect } from 'vitest';
import { hubMetrics } from '../hubMetrics';
import type { TournamentSummaryDTO } from '../../../api/dto';

const base = (o: Partial<TournamentSummaryDTO>): TournamentSummaryDTO => ({
  id: 'x', name: 'X', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null, ...o,
});
const sig = (o: Partial<NonNullable<TournamentSummaryDTO['signals']>>) => ({
  health: 'good' as const, attention: [], modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 },
  setup: {}, collaboration: { memberCount: 1, activeInviteCount: 0 }, ...o,
});

describe('hubMetrics', () => {
  it('totals workspaces / attention / active / shared / enabled modules / pending invites', () => {
    const list = [
      base({ id: 'a', status: 'active', role: 'owner', signals: sig({ health: 'attention', attention: [{ code: 'NO_ROSTER', label: 'x' }], modules: { enabled: 2, available: 1, disabled: 0, comingSoon: 0 }, collaboration: { memberCount: 1, activeInviteCount: 2 } }) }),
      base({ id: 'b', status: 'draft', role: 'viewer', signals: sig({ modules: { enabled: 1, available: 2, disabled: 0, comingSoon: 0 }, collaboration: { memberCount: 1, activeInviteCount: 1 } }) }),
    ];
    const m = hubMetrics(list);
    expect(m.workspaces).toBe(2);
    expect(m.attention).toBe(1); // a (health attention)
    expect(m.active).toBe(1); // a
    expect(m.shared).toBe(1); // b (viewer)
    expect(m.enabledModules).toBe(3); // 2 + 1
    expect(m.pendingInvites).toBe(3); // 2 + 1
  });
});
