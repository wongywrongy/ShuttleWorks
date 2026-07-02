import { describe, it, expect } from 'vitest';
import { badgesByPlayerId } from '../rosterEvents';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

/** Minimal snapshot: only the fields badgesByPlayerId reads. */
const snapshot = (
  events: Array<{
    id: string;
    discipline: string;
    participants: Array<{ id: string; name: string; members?: string[] }>;
  }>,
) => ({ events }) as unknown as BracketTournamentDTO;

describe('badgesByPlayerId', () => {
  it('carries the event discipline as type when codes relabel to event ids', () => {
    // Two MS draws force event-id badges ("DE", "MON") — the entries must
    // still attribute to Singles via type: 'MS' (SP-D7 S5 fix: the
    // EventsControl header summary grouped by code prefix and undercounted).
    const data = snapshot([
      { id: 'DE', discipline: 'MS', participants: [{ id: 'p-ana', name: 'Ana' }] },
      { id: 'MON', discipline: 'MS', participants: [{ id: 'p-ana', name: 'Ana' }] },
      {
        id: 'MD2X',
        discipline: 'MD',
        participants: [
          { id: 'MD2X-T1', name: 'Ana / Bruno', members: ['p-ana', 'p-bruno'] },
        ],
      },
    ]);
    expect(badgesByPlayerId(data).get('p-ana')).toEqual([
      { code: 'DE', type: 'MS' },
      { code: 'MON', type: 'MS' },
      // Only one MD draw → its badge stays the plain discipline code.
      { code: 'MD', type: 'MD' },
    ]);
    // Team members each get the badge.
    expect(badgesByPlayerId(data).get('p-bruno')).toEqual([
      { code: 'MD', type: 'MD' },
    ]);
  });

  it('keeps plain discipline codes when a discipline has a single draw', () => {
    const data = snapshot([
      { id: 'WS', discipline: 'WS', participants: [{ id: 'p-dana', name: 'Dana' }] },
    ]);
    expect(badgesByPlayerId(data).get('p-dana')).toEqual([
      { code: 'WS', type: 'WS' },
    ]);
  });

  it('sorts by canonical discipline order on type, then code', () => {
    const data = snapshot([
      { id: 'XD', discipline: 'XD', participants: [{ id: 'p', name: 'P' }] },
      { id: 'B-MS', discipline: 'MS', participants: [{ id: 'p', name: 'P' }] },
      { id: 'A-MS', discipline: 'MS', participants: [{ id: 'p', name: 'P' }] },
    ]);
    expect(badgesByPlayerId(data).get('p')?.map((b) => b.code)).toEqual([
      'A-MS',
      'B-MS',
      'XD',
    ]);
  });
});
