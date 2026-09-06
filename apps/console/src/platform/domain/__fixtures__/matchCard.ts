/**
 * Gate B fixtures (docs/reference/contracts/match-card.md §5) — MC-01…MC-13.
 * Built so both the table-row and `MatchCard` renderers, and the entrant
 * tier's parallel fixture module, show the same data. Every timestamp is a
 * real instant; no weekday or date string is hardcoded anywhere here (§2.6).
 */
import type { MatchCardData } from '../matchCardData';
import type { Side } from '../sides';
import { meetMatchIdentity } from '../matchIdentity';

const INSTANT = '2026-08-08T14:00:00+02:00'; // an arbitrary but real, fixed instant

function identity(sequence: number) {
  return meetMatchIdentity({ event_code: 'MS', sequence });
}

function resolvedSide(names: string[], seed: number | null = null): Side {
  return {
    persons: names.map((name, i) => ({ id: `p-${name}-${i}`, name })),
    unresolved: null,
    seed,
    participantKey: names.join('|'),
  };
}

function byeSide(): Side {
  return { persons: [], unresolved: { kind: 'bye' }, seed: null, participantKey: null };
}

function winnerOfSide(reference: string): Side {
  return {
    persons: [],
    unresolved: { kind: 'winner_of', reference },
    seed: null,
    participantKey: null,
  };
}

function pendingMemberSide(knownName: string): Side {
  return {
    persons: [{ id: `p-${knownName}`, name: knownName }],
    unresolved: {
      kind: 'pending_member',
      known: [{ id: `p-${knownName}`, name: knownName }],
      missing: 1,
    },
    seed: null,
    participantKey: null,
  };
}

function withheldSide(): Side {
  return { persons: [], unresolved: { kind: 'withheld' }, seed: null, participantKey: null };
}

function base(overrides: Partial<MatchCardData> & { sides: [Side, Side] }): MatchCardData {
  return {
    identity: identity(1),
    reference: 'MS1',
    eventLabel: "Men's singles",
    roundLabel: 'Round of 32',
    scheduleState: 'slot_pending',
    matchState: 'scheduled',
    outcome: { kind: 'in_play' },
    games: [],
    publication: { personsPublished: true, scoresPublished: true },
    ...overrides,
  };
}

// The long-name strings (MC-03), verbatim — each >= 28 characters, mixed
// with short ones so unequal side heights are exercised.
const LONG_NAMES = {
  a1: 'Aleksandra Wiśniewska-Kowalczyk',
  a2: 'Li Na',
  b1: 'Ratchanok Intanon-Wongsuwannakit',
  b2: 'Tao Ming Zhu',
};

export const matchCardFixtures = {
  'MC-01': base({
    reference: 'MS1',
    sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    day: { date: '2026-08-08' },
    court: { id: 5, label: 'Court 5' },
  }),

  'MC-02': base({
    reference: 'MD1',
    eventLabel: "Mixed doubles",
    sides: [
      resolvedSide(['Ana Silva', 'Ben Ito']),
      resolvedSide(['Chidi Okeke', 'Dan Reyes']),
    ],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    court: { id: 2, label: 'Court 2' },
  }),

  'MC-03': base({
    reference: 'MD2',
    eventLabel: 'Mixed doubles',
    sides: [
      resolvedSide([LONG_NAMES.a1, LONG_NAMES.a2]),
      resolvedSide([LONG_NAMES.b1, LONG_NAMES.b2]),
    ],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    court: { id: 1, label: 'Court 1' },
  }),

  'MC-04': base({
    reference: 'MD3',
    eventLabel: 'Mixed doubles',
    sides: [resolvedSide(['Ana Silva', 'Ben Ito']), pendingMemberSide('Chidi Okeke')],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    court: { id: 3, label: 'Court 3' },
  }),

  'MC-05': base({
    reference: 'QF2',
    sides: [resolvedSide(['Ana Silva']), winnerOfSide('QF1')],
    scheduleState: 'slot_approved',
    startsAt: '2026-08-08T14:00:00+02:00',
  }),

  'MC-06': base({
    reference: 'MS3',
    sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
    scheduleState: 'slot_pending',
  }),

  'MC-07': base({
    reference: 'MS4',
    sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    court: { id: 4, label: 'Court 4' },
    matchState: 'playing',
    outcome: { kind: 'in_play' },
    games: [
      { index: 1, a: 21, b: 17, state: 'complete', winner: 'a' },
      { index: 2, a: 19, b: 17, state: 'in_progress' },
    ],
  }),

  'MC-08': base({
    reference: 'MS5',
    sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    matchState: 'finished',
    outcome: { kind: 'decided', winner: 'a' },
    games: [
      { index: 1, a: 21, b: 15, state: 'complete', winner: 'a' },
      { index: 2, a: 18, b: 21, state: 'complete', winner: 'b' },
      { index: 3, a: 21, b: 19, state: 'complete', winner: 'a' },
    ],
    durationMinutes: 58,
  }),

  'MC-09': base({
    reference: 'MS6',
    sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    matchState: 'finished',
    outcome: { kind: 'walkover', winner: 'a', absentSide: 'b' },
    games: [],
  }),

  'MC-10': base({
    reference: 'MS7',
    sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    matchState: 'retired',
    outcome: { kind: 'retired', winner: 'a', retiredSide: 'b' },
    games: [
      { index: 1, a: 21, b: 12, state: 'complete', winner: 'a' },
      { index: 2, a: 11, b: 8, state: 'in_progress' },
    ],
  }),

  'MC-11': base({
    reference: 'MS8',
    sides: [resolvedSide(['Ana Silva']), withheldSide()],
    scheduleState: 'slot_approved',
    startsAt: INSTANT,
    matchState: 'finished',
    outcome: { kind: 'decided', winner: 'a' },
    games: [],
    publication: { personsPublished: false, scoresPublished: false },
  }),

  'MC-12': base({
    reference: 'MS9',
    sides: [resolvedSide(['Ana Silva']), byeSide()],
    scheduleState: 'slot_pending',
    games: [],
  }),

  'MC-13': {
    oneGame: base({
      reference: 'MS10',
      sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
      scheduleState: 'slot_approved',
      startsAt: INSTANT,
      matchState: 'finished',
      outcome: { kind: 'decided', winner: 'a' },
      games: [{ index: 1, a: 15, b: 3, state: 'complete', winner: 'a' }],
    }),
    bestOfThree: base({
      reference: 'MS11',
      sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
      scheduleState: 'slot_approved',
      startsAt: INSTANT,
      matchState: 'playing',
      outcome: { kind: 'in_play' },
      games: [
        { index: 1, a: 21, b: 19, state: 'complete', winner: 'a' },
        { index: 2, a: 15, b: 12, state: 'in_progress' },
      ],
    }),
    bestOfFive: base({
      reference: 'MS12',
      sides: [resolvedSide(['Ana Silva']), resolvedSide(['Ben Ito'])],
      scheduleState: 'slot_approved',
      startsAt: INSTANT,
      matchState: 'finished',
      outcome: { kind: 'decided', winner: 'b' },
      games: [
        { index: 1, a: 21, b: 15, state: 'complete', winner: 'a' },
        { index: 2, a: 18, b: 21, state: 'complete', winner: 'b' },
        { index: 3, a: 19, b: 21, state: 'complete', winner: 'b' },
        { index: 4, a: 21, b: 23, state: 'complete', winner: 'b' },
      ],
    }),
  },
} satisfies Record<string, MatchCardData | Record<string, MatchCardData>>;

/** MC-13's three named variants, per the Gate B fixture matrix. */
export const formats = matchCardFixtures['MC-13'];
export type MatchCardFixtureKey = Exclude<keyof typeof matchCardFixtures, 'MC-13'>;
