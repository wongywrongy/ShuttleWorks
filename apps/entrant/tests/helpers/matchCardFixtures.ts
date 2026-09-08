/**
 * The Gate B fixture matrix (match-card contract §5) for the entrant tier.
 *
 * Built on the entrant wire shape (`MatchCardData` = `PlayerMatchDTO` plus
 * the schedule/draw adapter fields). Since v3 package 29 that wire carries
 * the contract's discriminated `Side.unresolved` (§2.1), so every unresolved
 * side below states its `kind` — `bye`, `winner_of`, `pending_member` — and
 * the `placeholder` string beside it is only the legacy prose twin the
 * renderer no longer reads first. MC-04 is a REAL pending pair now, not the
 * one-person-side approximation it pinned in package 11.
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
    reference: 'MS R16·1',
    shortReference: 'R16·1',
  } satisfies MatchCardData,

  /** MC-02: doubles, four resolved persons, approved slot + court, no games. */
  doublesScheduled: {
    ...base,
    eventCode: 'MD',
    sides: [
      { persons: [person('p1', 'Ada Lovelace'), person('p2', 'Grace Hopper')], placeholder: null, winner: false },
      { persons: [person('p3', 'Katherine Johnson'), person('p4', 'Hedy Lamarr')], placeholder: null, winner: false },
    ],
    reference: 'MS R16·2',
    shortReference: 'R16·2',
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
    reference: 'MS R16·3',
    shortReference: 'R16·3',
  } satisfies MatchCardData,

  /**
   * MC-04: doubles, one side one player short of a pair — contract §2.1's
   * `pending_member`, the case `persons` and `unresolved` exist to express
   * TOGETHER. The known player is named AND the side says "partner to be
   * confirmed"; it never renders as an ordinary singles side and never
   * invents a second person. `known` is empty by design on the public tier
   * (`persons` above is the publication-gated known set — see
   * `entries_site.py::PublicUnresolvedSideDTO`).
   */
  incompletePair: {
    ...base,
    eventCode: 'MD',
    sides: [
      {
        persons: [person('p1', 'Ada Lovelace')],
        placeholder: null,
        winner: false,
        unresolved: { kind: 'pending_member', known: [], missing: 1 },
      },
      { persons: [person('p3', 'Katherine Johnson'), person('p4', 'Hedy Lamarr')], placeholder: null, winner: false },
    ],
    reference: 'MS R16·4',
    shortReference: 'R16·4',
  } satisfies MatchCardData,

  /** MC-05: side A resolved, side B `winner_of` QF1; slot approved, court
   *  absent. The label is BUILT from the discriminant's `reference`, not
   *  read off the placeholder sentence beside it (§6.1, D16). */
  unresolvedPredecessor: {
    ...base,
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: false },
      {
        persons: [],
        placeholder: 'Winner of QF1',
        winner: false,
        unresolved: { kind: 'winner_of', reference: 'QF1' },
      },
    ],
    scheduledTime: '14:00',
    court: null,
    reference: 'MS R16·5',
    shortReference: 'R16·5',
  } satisfies MatchCardData,

  /** MC-06: both sides resolved, no time, no court, no day. */
  noSchedule: {
    ...base,
    status: 'scheduled',
    scheduledTime: null,
    court: null,
    reference: 'MS R16·6',
    shortReference: 'R16·6',
  } satisfies MatchCardData,

  /** MC-07: `playing`, game 1 complete 21-17 to A, game 2 in progress 19-17 to A. */
  liveWithLead: {
    ...base,
    status: 'live',
    score: [[21, 17], [19, 17]],
    decided: false,
    reference: 'MS R16·7',
    shortReference: 'R16·7',
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
    reference: 'MS R16·8',
    shortReference: 'R16·8',
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
    reference: 'MS R16·9',
    shortReference: 'R16·9',
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
    reference: 'MS R16·10',
    shortReference: 'R16·10',
  } satisfies MatchCardData,

  /**
   * MC-11: side B withheld (not published). Publication is gated PER PERSON,
   * so the entrant wire mints this as a dead reference carrying the fixed
   * label (contract §2.3) — `entries_site.py::_person_ref` — rather than a
   * side-level `withheld` discriminant: a side may hold one published and
   * one withheld person, which a side-level flag could not say. Package 29
   * kept it that way deliberately; match-card §2.1 records the reason.
   */
  withheldSide: {
    ...base,
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: false },
      { persons: [{ identity: null, resolution: 'dead', label: 'Player not published' }], placeholder: null, winner: false },
    ],
    score: null,
    reference: 'MS R16·11',
    shortReference: 'R16·11',
  } satisfies MatchCardData,

  /** MC-12: side B is a bye, no games, no outcome. */
  bye: {
    ...base,
    sides: [
      { persons: [person('p1', 'Ada Lovelace')], placeholder: null, winner: false },
      { persons: [], placeholder: 'Bye', winner: false, unresolved: { kind: 'bye' } },
    ],
    score: null,
    reference: 'MS R16·12',
    shortReference: 'R16·12',
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
