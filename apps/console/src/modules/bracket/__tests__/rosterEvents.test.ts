import { describe, it, expect } from 'vitest';
import {
  badgesByPlayerId,
  partnerIdForPlayer,
  toUpsertParticipant,
} from '../rosterEvents';
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

describe('toUpsertParticipant', () => {
  it('echoes an assigned seed so a create-or-replace upsert preserves it', () => {
    expect(toUpsertParticipant({ id: 'P1', name: 'Alpha', seed: 2 })).toEqual({
      id: 'P1',
      name: 'Alpha',
      seed: 2,
    });
  });

  it('carries entryPlayerId so a roster edit does not erase the person key', () => {
    // R-DM-2(a). The editor owns the whole participant list and re-POSTs it,
    // so a key this mapper drops is a key deleted from the row — the
    // SP-CONSOLE-4 write-echo class of bug.
    expect(
      toUpsertParticipant({ id: 'P1', name: 'Alpha', entryPlayerId: 'ep-1' }),
    ).toEqual({ id: 'P1', name: 'Alpha', entryPlayerId: 'ep-1' });
  });

  it('omits entryPlayerId for a hand-added participant (null/absent)', () => {
    expect(
      toUpsertParticipant({ id: 'P2', name: 'Beta', entryPlayerId: null }),
    ).toEqual({ id: 'P2', name: 'Beta' });
    expect(toUpsertParticipant({ id: 'P3', name: 'Gamma' })).toEqual({
      id: 'P3',
      name: 'Gamma',
    });
  });

  it('omits seed when unseeded (null/absent) — no `seed` key on the wire', () => {
    expect(toUpsertParticipant({ id: 'P2', name: 'Beta', seed: null })).toEqual({
      id: 'P2',
      name: 'Beta',
    });
    expect(toUpsertParticipant({ id: 'P3', name: 'Gamma' })).toEqual({
      id: 'P3',
      name: 'Gamma',
    });
  });

  it('carries members and seed together for a doubles team', () => {
    expect(
      toUpsertParticipant({ id: 'MS-T1', name: 'A / B', members: ['a', 'b'], seed: 1 }),
    ).toEqual({ id: 'MS-T1', name: 'A / B', members: ['a', 'b'], seed: 1 });
  });
});

describe('partnerIdForPlayer', () => {
  it('resolves the other TEAM member from the event snapshot', () => {
    expect(
      partnerIdForPlayer(
        {
          participants: [
            { id: 'MD-T1', name: 'Ana / Bruno', members: ['p-ana', 'p-bruno'] },
          ],
        },
        'p-ana',
      ),
    ).toBe('p-bruno');
  });

  it('returns null for a singleton or a missing member', () => {
    expect(
      partnerIdForPlayer(
        { participants: [{ id: 'p-ana', name: 'Ana' }] },
        'p-ana',
      ),
    ).toBeNull();
    expect(
      partnerIdForPlayer(
        { participants: [{ id: 'MD-T1', name: 'Ana / ???', members: ['p-ana'] }] },
        'p-ana',
      ),
    ).toBeNull();
  });
});
