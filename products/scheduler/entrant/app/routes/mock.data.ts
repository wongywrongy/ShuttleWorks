/**
 * SP-P6-2 Phase B — the frozen fixture module behind the three mock pages.
 *
 * **Mockup data only. Deleted at Phase C** together with `mock.discovery.tsx`,
 * `mock.tournament.tsx`, `mock.enter.tsx` and `mock.ui.tsx`, once the owner
 * signs the layouts off and the real routes wire to real endpoints.
 *
 * Seeded realistically on purpose (brief Phase B): plausible venues, real
 * event codes and age bands, names of very different lengths, one tournament
 * days from its deadline and one closed — "Lorem Tournament 1" proves nothing
 * about whether a card survives a long name.
 *
 * Two shapes here carry fields the live API does NOT return yet — they mock
 * the open gate proposals so the owner can see what each buys:
 *   - `MockDiscoveryCard` is G1 (the live `GET /e/api/pages` returns `{slug}`
 *     only), with `entriesCloseAt` in the pinned `_moment` wire format;
 *   - `cap` on events is G2; `eventCode` on entrant rows is G5a.
 * Phase C must not wire any of them without the owner's ruling.
 *
 * Everything is `Object.freeze`d: module scope in this SSR process is shared
 * by every concurrent reader (`tests/helpers/sourceGuards.ts`). Freezing is
 * shallow, so the nested records are frozen individually where it matters —
 * nothing here is ever written to after module load.
 */
import type { EntryEventDTO } from '../lib/entryPage.types';
import type { DiscoveryCard } from '../lib/phase';
import type { FormEcho } from '../lib/echo';

/**
 * The fixture clock, as a pinned wire string so every page renders the same
 * countdowns forever. 2026-08-11 noon UTC: three and a half days before the
 * Wessex deadline below, which the chip rounds up to "closes in 4d".
 */
export const MOCK_NOW = '2026-08-11 12:00 UTC';

export interface MockDiscoveryCard extends DiscoveryCard {
  /** Phase B only: where the card links (the mock tournament page). */
  href: string;
}

const TOURNAMENT_HREF = '/e/mock.tournament';

export const MOCK_DISCOVERY_CARDS: readonly MockDiscoveryCard[] = Object.freeze([
  Object.freeze({
    slug: 'wessex-autumn-gold-2026',
    name: 'Wessex Autumn Gold 2026',
    tournamentDate: '2026-09-19',
    venueName: 'K2 Crawley',
    eventCount: 6,
    entriesOpen: true,
    entriesCloseAt: '2026-08-14 23:59 UTC',
    href: TOURNAMENT_HREF,
  }),
  Object.freeze({
    slug: 'lakeside-junior-bronze-2026',
    name: 'Lakeside Junior Bronze (U13–U17)',
    tournamentDate: '2026-10-03',
    venueName: 'Lakeside Arena, Eastbourne',
    eventCount: 9,
    entriesOpen: true,
    entriesCloseAt: '2026-09-21 18:00 UTC',
    href: TOURNAMENT_HREF,
  }),
  Object.freeze({
    slug: 'meadowbank-masters-2026',
    name: 'Meadowbank Masters O35',
    tournamentDate: '2026-08-29',
    venueName: 'Meadowbank Sports Centre, Edinburgh',
    eventCount: 5,
    entriesOpen: false,
    entriesCloseAt: null,
    href: TOURNAMENT_HREF,
  }),
  Object.freeze({
    slug: 'birmingham-senior-silver-2026',
    name: 'City of Birmingham Senior Silver',
    tournamentDate: '2026-11-14',
    venueName: 'Netherton Park NC, Birmingham',
    eventCount: 5,
    entriesOpen: true,
    entriesCloseAt: '2026-10-30 23:59 UTC',
    href: TOURNAMENT_HREF,
  }),
  Object.freeze({
    slug: 'sussex-spring-restricted-2026',
    name: 'Sussex Spring Restricted',
    tournamentDate: '2026-05-02',
    venueName: 'Triangle LC, Burgess Hill',
    eventCount: 6,
    entriesOpen: false,
    entriesCloseAt: null,
    href: TOURNAMENT_HREF,
  }),
  Object.freeze({
    slug: 'harrogate-winter-cup',
    name: 'Harrogate Winter Cup',
    tournamentDate: null,
    venueName: 'Harrogate District BC',
    eventCount: 4,
    entriesOpen: true,
    entriesCloseAt: null,
    href: TOURNAMENT_HREF,
  }),
]);

/**
 * The Phase-D "unlisted" tournament: reachable by direct slug, absent from
 * discovery. Kept out of `MOCK_DISCOVERY_CARDS` above — its only Phase-B job
 * is to exist so the fixture set matches the brief's Phase-D shape.
 */
export const MOCK_UNLISTED_SLUG = 'clubnight-invitational-2026';

export interface MockEvent extends EntryEventDTO {
  /** G2 (proposed): the model has `cap`; the projection does not ship it yet. */
  cap: number | null;
}

export interface MockEntrantRow {
  name: string;
  /** G5a (proposed): the event dimension the 2026-08-10 dedup dropped. */
  eventCode: string;
}

export interface MockTournamentPage {
  slug: string;
  name: string;
  date: string;
  orgName: string;
  venueName: string;
  venueAddress: string;
  introText: string;
  regulationsText: string;
  regulationsVersion: number;
  paymentInstructions: string;
  feeSchedule: Readonly<Record<string, number>>;
  maxEventsPerPerson: number;
  events: readonly MockEvent[];
  entrants: readonly MockEntrantRow[];
}

const EVENTS: readonly MockEvent[] = Object.freeze([
  Object.freeze({
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    code: 'MS',
    discipline: "Men's Singles",
    feeCents: 1400,
    genderConstraint: 'M',
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-14 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    isOpen: true,
    ageBracketed: false,
    entryCount: 7,
    cap: 32,
  }),
  Object.freeze({
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    code: 'WS',
    discipline: "Women's Singles",
    feeCents: 1400,
    genderConstraint: 'F',
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-14 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    isOpen: true,
    ageBracketed: false,
    entryCount: 5,
    cap: 32,
  }),
  Object.freeze({
    id: 'cccccccc-3333-4333-8333-333333333333',
    code: 'MD',
    discipline: "Men's Doubles",
    feeCents: 1100,
    genderConstraint: 'M',
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-14 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    isOpen: true,
    ageBracketed: false,
    entryCount: 4,
    cap: 16,
  }),
  Object.freeze({
    // Closed early — its deadline passed on 1 Aug, so the server says
    // `isOpen: false` while the tournament as a whole stays open. This is the
    // event that makes the timeline's "Entries close" a per-event range.
    id: 'dddddddd-4444-4444-8444-444444444444',
    code: 'WD',
    discipline: "Women's Doubles",
    feeCents: 1100,
    genderConstraint: 'F',
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-01 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    isOpen: false,
    ageBracketed: false,
    entryCount: 4,
    cap: 16,
  }),
  Object.freeze({
    id: 'eeeeeeee-5555-4555-8555-555555555555',
    code: 'XD',
    discipline: 'Mixed Doubles',
    feeCents: 1100,
    genderConstraint: null,
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-14 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    isOpen: true,
    ageBracketed: false,
    entryCount: 4,
    cap: 24,
  }),
  Object.freeze({
    id: 'ffffffff-6666-4666-8666-666666666666',
    code: 'OMS',
    discipline: "O40 Men's Singles",
    feeCents: 1200,
    genderConstraint: 'M',
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-14 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    isOpen: true,
    ageBracketed: true,
    entryCount: 3,
    cap: 16,
  }),
]);

const ENTRANTS: readonly MockEntrantRow[] = Object.freeze(
  (
    [
      ['Tom Barker', 'MS'],
      ['Aravindh Krishnamurthy', 'MS'],
      ['Jack Whitehouse-Fenn', 'MS'],
      ['Ben Ng', 'MS'],
      ['Oliver Pemberton', 'MS'],
      ['Daniel Okafor', 'MS'],
      ['Marcus Lim', 'MS'],
      ["Grace O'Donnell", 'WS'],
      ['Priya Radhakrishnan', 'WS'],
      ['Emily Chen', 'WS'],
      ['Sasha Novak', 'WS'],
      ['Freya Llewellyn-Jones', 'WS'],
      ['Tom Barker', 'MD'],
      ['Ben Ng', 'MD'],
      ['Callum Reid', 'MD'],
      ['Josh Adeyemi', 'MD'],
      ['Emily Chen', 'WD'],
      ['Sasha Novak', 'WD'],
      ['Hannah Whitfield', 'WD'],
      ['Mia Kowalczyk', 'WD'],
      ['Marcus Lim', 'XD'],
      ["Grace O'Donnell", 'XD'],
      ['Josh Adeyemi', 'XD'],
      ['Priya Radhakrishnan', 'XD'],
      ['Richard Threlfall', 'OMS'],
      ['Stephen Mbeki', 'OMS'],
      ['Andy Cole', 'OMS'],
    ] as const
  ).map(([name, eventCode]) => Object.freeze({ name, eventCode })),
);

export const MOCK_TOURNAMENT: MockTournamentPage = Object.freeze({
  slug: 'wessex-autumn-gold-2026',
  name: 'Wessex Autumn Gold 2026',
  date: '2026-09-19',
  orgName: 'Wessex County Badminton Association',
  venueName: 'K2 Crawley',
  venueAddress: 'Pease Pottage Hill, Crawley RH11 9BQ',
  introText:
    'A one-day Gold-level open tournament across six events, played to BWF ' +
    'laws on eight courts. All matches are best of three games to 21; ' +
    'shuttles (Yonex AS-50) are provided from the quarter-finals. Open to ' +
    'Badminton England members; O40 singles requires proof of age at the desk.',
  regulationsText:
    '1. Entries are accepted in order of receipt and are confirmed only once ' +
    'payment has cleared. Where an event is oversubscribed a waiting list ' +
    'operates in entry order.\n' +
    '2. All matches are played under BWF Laws of Badminton and Badminton ' +
    'England tournament regulations. The referee’s decision is final.\n' +
    '3. Players must report to the control desk within 10 minutes of their ' +
    'match being called. A player not present when called a second time may ' +
    'be scratched from that event.\n' +
    '4. Withdrawals before the withdrawal deadline are refunded in full, ' +
    'less a 2.00 administration fee per player. After the deadline no refund ' +
    'is made except on production of a medical certificate.\n' +
    '5. Clothing must conform to Badminton England regulations. Advertising ' +
    'on clothing is limited to the manufacturer’s standard markings.\n' +
    '6. The organisers reserve the right to merge events with fewer than ' +
    'eight entries, and to restrict entries per event where court time requires.',
  regulationsVersion: 4,
  paymentInstructions:
    'Bank transfer to Wessex CBA — sort code 20-45-45, account 33812291, ' +
    'reference: first player’s surname + WAG26. Entries are provisional ' +
    'until payment clears; unpaid entries are dropped at the withdrawal deadline.',
  feeSchedule: Object.freeze({ '1': 1400, '2': 2400, '3': 3000 }),
  maxEventsPerPerson: 3,
  events: EVENTS,
  entrants: ENTRANTS,
});

/**
 * The enter mockup's pre-filled state: two players, three events, and the
 * server-quoted total for that basket. `totalCents` is a literal because the
 * quote is the SERVER's (R14) — 2 events at the 2400 tier for Priya plus
 * 1 event at 1400 for Daniel, exactly what `compute_fee_total` would say.
 */
export const MOCK_ENTER_ECHO: FormEcho = Object.freeze({
  players: Object.freeze([
    Object.freeze({
      name: 'Priya Radhakrishnan',
      gender: 'F',
      club: 'Guildford Racquets',
      birthYear: '1998',
      remarks: '',
      events: Object.freeze([
        `0:${EVENTS[1].id}`, // WS
        `0:${EVENTS[4].id}`, // XD
      ]) as string[],
    }),
    Object.freeze({
      name: 'Daniel Okafor',
      gender: 'M',
      club: '',
      birthYear: '',
      remarks: "Can't play before 10:30 — travelling down on the day.",
      events: Object.freeze([`1:${EVENTS[0].id}`]) as string[], // MS
    }),
  ]) as FormEcho['players'],
  showAllEvents: false,
  totalCents: 3800,
  refusal: null,
}) as FormEcho;
