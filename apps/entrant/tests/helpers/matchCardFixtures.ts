/**
 * The Gate B fixture matrix (match-card contract §5) for the entrant tier.
 *
 * Built on the entrant wire shape (`MatchCardData` = `PlayerMatchDTO` plus
 * the schedule/draw adapter fields) rather than the contract's aspirational
 * tier-neutral `MatchCardData` (§2) verbatim — the entrant DTO does not yet
 * carry a discriminated `Side.unresolved` (that is package 10/10a's D17
 * wire-shape work), so an unresolved side here is expressed the only way
 * the current wire can: `persons: []` plus a `placeholder` string. MC-04
 * (`incompletePair`) is annotated below with the specific gap this leaves.
 *
 * Every timestamp is a real instant; nothing here hardcodes a weekday or
 * date string (contract §2.6) — `scheduledTime` is the wire's naive
 * venue-local `HH:MM`, never parsed as an instant.
 */
import type { MatchCardData } from '../../app/components/MatchCard';

const base: MatchCardData = {
  eventCode: 'MS',
  roundLabel: 'Round of 16',
  sides: [
    { persons: [{ identity: { id: 'p1', name: 'Ada Lovelace' }, resolution: 'resolved', label: null }], placeholder: null, winner: false },
    { persons: [{ identity: { id: 'p2', name: 'Grace Hopper' }, resolution: 'resolved', label: null }], placeholder: null, winner: false },
  ],
  score: null,
  decided: false,
  status: 'scheduled',
  scheduledTime: '10:00',
  court: 3,
  durationMinutes: null,
  updatedAt: null,
};

const person = (id: string, name: string) => ({ identity: { id, name }, resolution: 'resolved' as const, label: null });

export const matchCardFixtures = {
  /** MC-01: singles, both sides resolved, approved slot + court, no games. */
  singlesScheduled: {
    ...base,
    matchNumber: 1,
  } satisfies MatchCardData,

  /** MC-02: doubles, four resolved persons, approved slot + court, no games. */
  doublesScheduled: {
    ...base,
    eventCode: 'MD',
    sides: [
      { persons: [person('p1', 'Ada Lovelace'), person('p2', 'Grace Hopper')], placeholder: null, winner: false },
      { persons: [person('p3', 'Katherine Johnson'), person('p4', 'Hedy Lamarr')], placeholder: null, winner: false },
    ],
    matchNumber: 2,
  } satisfies MatchCardData,

  /**
   * MC-03: doubles, long diacritic-bearing names, deliberately unequal side
   * lengths. The entrant tier's no-truncation policy (`tests/noTruncation.
   * test.ts`) means these never ellipsise anywhere — they wrap — so the
   * §6.1 "full name reachable without hover" assertion holds structurally.
   */
  longNamesDoubles: {
    ...base,
    eventCode: 'MD',
    sides: [
      {
        persons: [
          person('p5', 'Aleksandra Wiśniewska-Kowalczyk'),
          person('p6', 'Ratchanok Intanon-Wongsuwannakit'),
        ],
        placeholder: null,
        winner: false,
      },
      {
        persons: [person('p7', 'Li Na'), person('p8', 'Tao Ming Zhu')],
        placeholder: null,
        winner: false,
      },
    ],
    matchNumber: 3,
  } satisfies MatchCardData,

  /**
   * MC-04: doubles, one side one player short of a pair.
   *
   * GAP (logged in the package 11 report as a blocked item): the wire has
   * no `pending_member` discriminant (contract §2.1's `UnresolvedSide`),
   * so a one-player doubles side renders exactly as a resolved SINGLES
   * side today — there is no "partner to be confirmed" text and no way to
   * distinguish this from an actual singles match at this layer. This
   * fixture pins that CURRENT, imperfect behaviour rather than an
   * aspirational one, so a future wire change is a visible test update,
   * not a silent one.
   */
  incompletePair: {
    ...base,
    eventCode: 'MD',
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: false },
      { persons: [person('p3', 'Katherine Johnson'), person('p4', 'Hedy Lamarr')], placeholder: null, winner: false },
    ],
    matchNumber: 4,
  } satisfies MatchCardData,

  /** MC-05: side A resolved, side B `winner_of` QF1; slot approved, court absent. */
  unresolvedPredecessor: {
    ...base,
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: false },
      { persons: [], placeholder: 'Winner of QF1', winner: false },
    ],
    scheduledTime: '14:00',
    court: null,
    matchNumber: 5,
  } satisfies MatchCardData,

  /** MC-06: both sides resolved, no time, no court, no day. */
  noSchedule: {
    ...base,
    status: 'scheduled',
    scheduledTime: null,
    court: null,
    matchNumber: 6,
  } satisfies MatchCardData,

  /** MC-07: `playing`, game 1 complete 21-17 to A, game 2 in progress 19-17 to A. */
  liveWithLead: {
    ...base,
    status: 'live',
    score: [[21, 17], [19, 17]],
    decided: false,
    matchNumber: 7,
  } satisfies MatchCardData,

  /** MC-08: `finished`, decided to A; the losing side won a game. */
  completedLoserWonAGame: {
    ...base,
    status: 'completed',
    decided: true,
    score: [[21, 15], [18, 21], [21, 19]],
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: true },
      { persons: [person('p2', 'Grace Hopper')], placeholder: null, winner: false },
    ],
    durationMinutes: 42,
    matchNumber: 8,
  } satisfies MatchCardData,

  /** MC-09: `finished`, walkover, winner A, absent side B, no games. */
  walkover: {
    ...base,
    status: 'walkover',
    decided: true,
    score: null,
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: true },
      { persons: [person('p2', 'Grace Hopper')], placeholder: null, winner: false },
    ],
    matchNumber: 9,
  } satisfies MatchCardData,

  /** MC-10: `retired`, winner A, partial ledger. */
  retirement: {
    ...base,
    status: 'retired',
    decided: true,
    score: [[21, 12], [11, 8]],
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: true },
      { persons: [person('p2', 'Grace Hopper')], placeholder: null, winner: false },
    ],
    matchNumber: 10,
  } satisfies MatchCardData,

  /**
   * MC-11: side B withheld (not published). The entrant wire already mints
   * this as a dead reference carrying the fixed label (contract §2.3) —
   * `apps/api/src/entries/entries_site.py:_person_ref` — rather than a
   * `withheld` discriminant the card branches on.
   */
  withheldSide: {
    ...base,
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: false },
      { persons: [{ identity: null, resolution: 'dead', label: 'Player not published' }], placeholder: null, winner: false },
    ],
    score: null,
    matchNumber: 11,
  } satisfies MatchCardData,

  /** MC-12: side B is a bye, no games, no outcome. */
  bye: {
    ...base,
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: false },
      { persons: [], placeholder: 'Bye', winner: false },
    ],
    score: null,
    matchNumber: 12,
  } satisfies MatchCardData,

  /** MC-13: three ledger widths — never padded to a configured maximum. */
  formats: {
    oneGame: {
      ...base,
      status: 'completed',
      decided: true,
      score: [[21, 15]],
      sides: [
        { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: true },
        { persons: [person('p2', 'Grace Hopper')], placeholder: null, winner: false },
      ],
    } satisfies MatchCardData,
    bestOfThree: {
      ...base,
      status: 'completed',
      decided: true,
      score: [[21, 15], [18, 21], [21, 19]],
      sides: [
        { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: true },
        { persons: [person('p2', 'Grace Hopper')], placeholder: null, winner: false },
      ],
    } satisfies MatchCardData,
    bestOfFive: {
      ...base,
      status: 'completed',
      decided: true,
      score: [[15, 10], [11, 15], [15, 12], [13, 15], [15, 9]],
      sides: [
        { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: true },
        { persons: [person('p2', 'Grace Hopper')], placeholder: null, winner: false },
      ],
    } satisfies MatchCardData,
  },
};
