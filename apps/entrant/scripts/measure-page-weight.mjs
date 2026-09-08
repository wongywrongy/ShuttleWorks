#!/usr/bin/env node
/**
 * Measures the real gzipped weight of the public pages — discovery (`/e/`),
 * the tournament page (`/e/{slug}`) and the enter page (`/e/{slug}/enter`)
 * — on a production build. The bounded progressive-enhancement posture, as
 * a number.
 *
 * "Page weight" here is what a browser actually pays for: the server-
 * rendered HTML (what a no-JS visitor gets in full) PLUS every script the
 * HTML actually references. Each file is gzipped on its own and the
 * compressed sizes are summed, because that is how they cross the wire: as
 * separate HTTP responses, not one concatenated blob. CSS is deliberately
 * not counted — the brief's "HTML plus critical JS" is explicit, and
 * `app-*.css` is reported separately, below the gate, as a number a reader
 * can still see.
 *
 * **The script set is read OUT OF THE RENDERED HTML, not walked out of the
 * build manifest.** It used to be the manifest — the client entry, `root`
 * and the `:slug` route's chunk — and that number stopped being true the day
 * `app/root.tsx` dropped `<Scripts/>`: the manifest still lists 122.5 KB of
 * client bundle, the build still writes it to `build/client/assets/`, and no
 * browser ever asks for a byte of it. A page-weight gate reading the
 * manifest would keep charging the app for a download it does not make.
 * Reading the document is both smaller and honest, and it re-arms by itself:
 * restore `<Scripts/>` and the framework floor lands straight back in this
 * number.
 *
 * Renders through the REAL production server build (`build/server/index.js`,
 * the same `createRequestHandler` the running app uses), against a stubbed
 * backend — same idiom `tests/entry.render.test.ts` uses for the identical
 * route, with the identical fixture, so the measured HTML is the shape a
 * real entry page actually renders, not a stand-in.
 *
 * Run after `npm run build`: `node scripts/measure-page-weight.mjs`.
 *
 * OWNER RULING R8-F (2026-08-07) set BUDGET_KB to 123 to cover a ~98.8 KB
 * react-dom + React Router hydration floor. THAT FLOOR IS GONE: this tier
 * ships no React hydration (see the note in `app/root.tsx`). Route-scoped
 * external modules are counted when a measured document references them. The
 * budget below is re-derived from the measurement, not inherited. The gate
 * STAYS BLOCKING.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const clientDir = path.join(root, 'build', 'client');
const serverEntry = path.join(root, 'build', 'server', 'index.js');

if (!fs.existsSync(serverEntry) || !fs.existsSync(clientDir)) {
  console.error(`Production build not found under ${path.join(root, 'build')}.`);
  console.error(`Run: npm --prefix apps/entrant run build`);
  process.exit(1);
}

function gzipSizeOf(absPath) {
  return zlib.gzipSync(fs.readFileSync(absPath)).length;
}

// ---- the real server-rendered HTML for one entry page --------------------

process.env.API_BASE_URL ??= 'http://backend.invalid';

// The SAME fixture `tests/entry.render.test.ts` renders, not a copy of it.
// These two render the same route through the same handler, and this one turns
// its HTML into the number the CI gate checks — so a divergence here does not
// fail, it silently SHRINKS the measured page and buys headroom no real entry
// page has. It WAS a 60-line verbatim duplicate; hoisted to JSON because these
// two consumers share no module system (that one is TypeScript under vitest,
// this is plain node). `viewer` is absent by design; see the fixture's note in
// `tests/entry.render.test.ts`.
const PAGE = JSON.parse(
  fs.readFileSync(path.join(root, 'tests', 'helpers', 'entryPage.fixture.json'), 'utf-8'),
);

/**
 * The published-results half of the public tier, measured (public-visual-fixes
 * P8). `PAGE` above is an entry-taking tournament with no draws, so the three
 * heaviest public documents this tier serves — the Players directory, a full
 * bracket, and the schedule — had NO number at all: none of them was in
 * `MEASURED`, so `bracket-path.js`, `entrants-filter.js` and P7's new
 * `schedule-filters.js` could grow without the gate noticing.
 *
 * Served under a second slug because one page projection cannot be both
 * "draws not published" (what `/e/spring-open` must stay, so its measurement
 * does not change) and "results published" (what these three need). The
 * payloads are generated rather than captured so the numbers describe the
 * worst case the design has to hold — a full 32 draw with every round
 * populated, 256 entrants with long names, and a whole schedule page — rather
 * than whatever one fixture happens to contain.
 */
const PLAYED_SLUG = 'season-finals';
const PLAYED_PAGE = {
  ...PAGE,
  publication: { entrants: true, draws: true, results: true },
};

// Long, real-shaped names: the directory's width is set by its longest row,
// and a Latin-only short-name fixture measures a page nobody has.
const SURNAMES = [
  'Pahlevi Isfahani',
  'Cahaya Pratiwi',
  'Wardoyo Ramadhanti',
  'Kang Khai Xing',
  'Sabar Karyaman Gutama',
  'Chettithody Shetty',
  'Widjaja Kusumawardhani',
  'Rambitan Sugiarto',
];
const GIVEN_NAMES = [
  'Muhammad Reza',
  'Amallia',
  'Bagas',
  'Jonatan',
  'Gregoria Mariska',
  'Pramudya Kusumawardana',
  'Apriyani',
  'Fajar Alfian',
];
const CLUBS = [
  'Northgate Badminton Club',
  'Harbourline Shuttlers',
  'Riverside Racquet Academy',
  'Summit Badminton Centre',
];
const EVENT_CODES = ['MS', 'WS', 'MD', 'WD', 'XD'];

const personName = (index) =>
  `${GIVEN_NAMES[index % GIVEN_NAMES.length]} ${SURNAMES[(index >> 3) % SURNAMES.length]}`;
// Stable, well-formed UUIDs: the person key is a URL segment on every row, so
// its length is part of the measurement.
const personId = (index) =>
  `${String(index).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;
const personRef = (index) => ({
  identity: { id: personId(index), name: personName(index) },
  resolution: 'resolved',
  label: null,
});

/** A 256-name Players directory — one full draw's worth of every discipline. */
const PLAYED_PLAYERS = {
  published: true,
  players: Array.from({ length: 256 }, (_, index) => ({
    playerKey: `entry-${personId(index)}`,
    person: personRef(index),
    club: CLUBS[index % CLUBS.length],
    eventCodes: [EVENT_CODES[index % EVENT_CODES.length]],
  })),
  referencedPlayerCount: 256,
  missingNameCount: 0,
};

/**
 * A complete 32 draw: five rounds, every node carrying a reference, a real
 * score and a scheduled time, with the last two rounds fed from the round
 * before so the feeder-slot rendering is measured too.
 */
function playedDraw() {
  const rounds = [];
  const labels = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
  const short = ['R32', 'R16', 'QF', 'SF', 'F'];
  const nodeKey = (round, position) => `DRAW-MS-${short[round]}-${position}`;
  for (let round = 0; round < labels.length; round++) {
    const count = 16 >> round;
    rounds.push({
      label: labels[round],
      matches: Array.from({ length: count }, (_, slot) => {
        const position = slot + 1;
        const played = round < labels.length - 1;
        return {
          nodeKey: nodeKey(round, position),
          position,
          reference: `MS ${short[round]}·${position}`,
          shortReference: `${short[round]}·${position}`,
          sides: [0, 1].map((side) => ({
            participantKey:
              round === 0 ? `entry-${personId(slot * 2 + side)}` : null,
            placeholder: null,
            bye: false,
            feederNodeKey: round === 0 ? null : nodeKey(round - 1, position * 2 - 1 + side),
            feederTake: round === 0 ? null : 'winner',
            unresolved: null,
          })),
          result: played
            ? { winnerSide: 'A', score: [[21, 18], [19, 21], [21, 15]], walkover: false }
            : null,
          scheduledTime: '13:00',
          court: played ? null : ((position % 6) + 1),
          playedOn: '2026-07-31',
          localTime: '13:00',
          courtLabel: `Court ${(position % 6) + 1}`,
          sourceUrl: null,
          sourceRef: null,
        };
      }),
    });
  }
  return {
    drawKey: 'MS',
    eventCode: 'MS',
    discipline: 'MS',
    kind: 'se',
    size: 32,
    resultsPublished: true,
    matchCoverage: { imported: 31, expected: 31, missing: 0 },
    recordScope: 'full_draw',
    topologyScope: 'full_draw',
    historical: false,
    sourceUrl: null,
    identityScope: 'source_local_name',
    teams: Array.from({ length: 32 }, (_, index) => ({
      participantKey: `entry-${personId(index)}`,
      persons: [personRef(index)],
      club: CLUBS[index % CLUBS.length],
      seed: index < 8 ? index + 1 : null,
    })),
    segments: [{ id: 'MAIN', label: 'Draw', rounds }],
    standings: null,
  };
}

/** One schedule page at the projection's own page size, all five states. */
const SCHEDULE_STATES = ['live', 'completed', 'scheduled', 'walkover', 'retired'];
function playedSchedule() {
  const items = Array.from({ length: 25 }, (_, index) => {
    const status = SCHEDULE_STATES[index % SCHEDULE_STATES.length];
    return {
      matchKey: `MS:DRAW-MS-R32-${index + 1}`,
      source: 'bracket',
      eventCode: EVENT_CODES[index % EVENT_CODES.length],
      discipline: EVENT_CODES[index % EVENT_CODES.length],
      roundLabel: 'Round of 32',
      status,
      scheduledDate: '2026-07-31',
      scheduledTime: '13:00',
      court: status === 'live' ? (index % 6) + 1 : null,
      sides: [0, 1].map((side) => ({
        participantKey: `entry-${personId(index * 2 + side)}`,
        persons: [personRef(index * 2 + side)],
        placeholder: null,
        unresolved: null,
      })),
      score:
        status === 'completed' || status === 'retired'
          ? [[21, 18], [19, 21], [21, 15]]
          : null,
      walkover: status === 'walkover',
      winnerSide: status === 'completed' ? 'A' : null,
      updatedAt: '2026-07-31T05:00:00',
      reference: `MS R32·${index + 1}`,
      shortReference: `R32·${index + 1}`,
    };
  });
  return {
    published: true,
    items,
    facets: {
      days: [
        { day: '2026-07-29', count: 74 },
        { day: '2026-07-30', count: 20 },
        { day: '2026-07-31', count: 12 },
        { day: '2026-08-01', count: 15 },
        { day: '2026-08-02', count: 12 },
      ],
      events: EVENT_CODES,
      courts: [1, 2, 3, 4, 5, 6],
      states: ['completed', 'live', 'retired', 'scheduled', 'walkover'],
    },
    page: 1,
    pageSize: 25,
    total: 155,
    timeZone: 'Asia/Taipei',
    updatedAt: '2026-07-31T05:00:00',
    revision: 'measure-fixture',
  };
}

const json = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === `${process.env.API_BASE_URL}/e/api/pages`) {
    // The season list. P5 made ONE SEASON the content boundary and removed
    // the pagination that used to cap this page at ten rows, so measuring a
    // single-row list would measure a page nobody has: the number that
    // matters is a REAL season, one busy month after another. Twenty-four
    // tournaments across a year — half of them already played, so both the
    // full-weight and the muted halves are in the measurement — with
    // `spring-open` first so `/e/spring-open` below measures the same
    // tournament's page.
    //
    // The dates are relative to the render clock because "upcoming" and
    // "earlier this season" are decided against today: fixed 2026 literals
    // would quietly move the whole list into the past and stop measuring the
    // upcoming half at all.
    const today = new Date();
    const day = (offset) =>
      new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    const season = {
      tournaments: [
        {
          slug: 'spring-open',
          name: 'Spring Open',
          organizer: 'Riverside BC',
          venueName: 'Riverside Sports Hall',
          date: day(12),
          eventCount: 4,
          status: 'entries_open',
          closesInDays: 5,
          closesAt: '2026-09-01 22:00 UTC',
          timeZone: 'Europe/London',
          locality: 'Winchester, United Kingdom',
          drawsPublished: false,
          winnersPublished: false,
        },
        ...Array.from({ length: 23 }, (_, index) => {
          const past = index >= 11;
          return {
            slug: `regional-championship-${index + 1}`,
            name: `Regional Championship ${index + 1}`,
            organizer: 'Northgate Badminton Club',
            venueName: 'Northgate Leisure Centre',
            date: day(past ? -14 * (index - 10) : 20 + 12 * index),
            eventCount: 5,
            status: past ? 'completed_winners' : 'entries_open',
            closesInDays: past ? null : 9,
            closesAt: past ? null : '2026-09-01 22:00 UTC',
            timeZone: 'Europe/London',
            locality: 'Winchester, United Kingdom',
            drawsPublished: past,
            winnersPublished: past,
          };
        }),
      ],
      counts: { takingEntries: 12, completed: 12 },
      now: null,
    };
    return new Response(JSON.stringify(season), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url === `${process.env.API_BASE_URL}/e/api/page/spring-open`) {
    return new Response(JSON.stringify(PAGE), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  const played = `${process.env.API_BASE_URL}/e/api/page/${PLAYED_SLUG}`;
  if (url === played) return json(PLAYED_PAGE);
  if (url === `${played}/players`) return json(PLAYED_PLAYERS);
  if (url === `${played}/draws/MS`) return json(playedDraw());
  if (url.startsWith(`${played}/matches`)) return json(playedSchedule());
  throw new Error(`measure-page-weight: unexpected fetch ${url}`);
};

const { createRequestHandler } = await import('react-router');
const build = await import(pathToFileURL(serverEntry).href);
const handler = createRequestHandler(build, 'production');

/**
 * SP-P6-2: three measured documents, one gate each — discovery (`/e/`), the
 * tournament page (`/e/{slug}`) and the enter page (`/e/{slug}/enter`). The
 * enter page carries the real CSRF + idempotency fields; the tournament page
 * is the sitemap-listed poster URL; discovery is the front door.
 */
const MEASURED = [
  '/e/',
  '/e/spring-open',
  '/e/spring-open/enter',
  // public-visual-fixes P8: the three published-results documents, which the
  // gate could not see at all before. Each is measured at the worst case its
  // design has to hold (see PLAYED_* above), and each references a different
  // page-scoped script — `entrants-filter.js`, `bracket-path.js` and P7's
  // `schedule-filters.js` — so the enhancement layer is now inside a number.
  `/e/${PLAYED_SLUG}?tab=players`,
  `/e/${PLAYED_SLUG}/draws/MS`,
  `/e/${PLAYED_SLUG}/schedule`,
];

/**
 * 2026-08-11 design audit, finding #7 ("the page-weight gate cannot see the
 * state that breaks its own budget"). Every measurement above is a bare GET,
 * and a bare GET's `echo.players` is always `[]` — so `visibleBlocks()`
 * (`app/lib/phase.ts`) was structurally incapable of returning anything but
 * `1`, no matter how the enter page is actually used. The form's own worst
 * case is the "Add another player" round trip clamped at 8 blocks (Z12's
 * documented display bound), and each block re-renders the full open-events
 * checkbox list with no dedup — the growth driver.
 *
 * Reached the SAME way a real entrant reaches it: a POST to the enter
 * route's own action with `addPlayer=1` (no backend call, no credential —
 * see `action()` in `routes/enter.tsx`), which is exactly what the "Add
 * another player" button's `formAction` does. Player content is irrelevant
 * to weight (the checkbox list dominates it), so one POST carrying 7 echoed
 * players + `addPlayer=1` reaches the 8-block ceiling in a single request
 * rather than 7 sequential round trips.
 */
function enterCeilingRequestInit() {
  const body = new URLSearchParams();
  body.set('addPlayer', '1');
  for (let i = 0; i < 7; i++) {
    body.append('playerName', `Player ${i + 1}`);
    body.append('gender', '');
    body.append('club', '');
    body.append('birthYear', '');
    body.append('remarks', '');
  }
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  };
}

async function measure(pathname, init, label = pathname) {
  const response = await handler(new Request(`http://weight-check.test${pathname}`, init));
  if (response.status !== 200) {
    console.error(`Rendering ${pathname} returned ${response.status}, not 200.`);
    console.error(await response.text());
    process.exit(1);
  }
  const html = await response.text();
  const htmlGzipBytes = zlib.gzipSync(Buffer.from(html, 'utf-8')).length;

  // The scripts the document actually asks for. Inline scripts are already
  // inside `htmlGzipBytes`, so only `src=` costs anything extra; URLs are
  // `${publicPath}assets/…` per the build itself.
  const scriptSrcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const criticalJsBytes = scriptSrcs.reduce((sum, url) => {
    const rel = url.startsWith(build.publicPath) ? url.slice(build.publicPath.length) : url;
    const abs = path.join(clientDir, rel.replace(/^\//, ''));
    if (!fs.existsSync(abs)) {
      console.error(`The page references ${url}, which is not in build/client — 404 in prod.`);
      process.exit(1);
    }
    return sum + gzipSizeOf(abs);
  }, 0);

  return { pathname: label, htmlGzipBytes, criticalJsBytes, scriptCount: scriptSrcs.length };
}

const measured = [];
for (const pathname of MEASURED) {
  measured.push(await measure(pathname));
}
measured.push(
  await measure(
    '/e/spring-open/enter',
    enterCeilingRequestInit(),
    '/e/spring-open/enter [8 blocks]',
  ),
);

// Poster/discovery documents retain the original 4 KB budget. The approved
// persistent entry journey has its own 8 KB budget: its measured payload is
// the complete eligibility/account/participant/events/partner/review markup
// plus the route-scoped enhancement, including the eight-player ceiling.
// Keeping the budgets per route prevents that intentional transaction cost
// from silently buying headroom for every public document.
//
// The old number was 123 KB. R8-F derived that from a ~98.8 KB react-dom +
// React Router HYDRATION FLOOR, and that floor no longer exists — `root.tsx`
// renders no `<Scripts/>`. The 4 KB figure was then derived from the
// SP-P6-1 document (2.5 KB measured); the SP-P6-2 redesign's three pages
// measure inside it (G6 stays open — if the enter page outgrows it once
// real content lands, the budget is re-derived from measurement, gate
// blocking, per the R8-F precedent).
const PUBLIC_BUDGET_KB = 4;
const ENTRY_BUDGET_KB = 8;
// The published-results documents. Their content is a ROSTER, a TREE and a
// DAY — 256 rows, 31 nodes, 25 match cards — so their floor is the data the
// reader came for, not chrome, and holding them to the 4 KB poster budget
// would only say "a full draw is bigger than a poster". Derived from the
// first measurement (11.1 KB, the Players directory) the same way R8-F
// derived the numbers above, with the same order of headroom; gate
// blocking, and deliberately NOT applied to the three documents above: the
// poster and entry budgets are unchanged, so nothing here buys headroom for
// them.
const RESULTS_BUDGET_KB = 14;
const CI_SLACK = 1.1;

function budgetKbFor(pathname) {
  if (pathname.startsWith('/e/spring-open/enter')) return ENTRY_BUDGET_KB;
  if (pathname.startsWith(`/e/${PLAYED_SLUG}`)) return RESULTS_BUDGET_KB;
  return PUBLIC_BUDGET_KB;
}

let cssNote = '';
const cssFile = fs.readdirSync(path.join(clientDir, 'assets')).find((f) => /^app-.*\.css$/.test(f));
if (cssFile) {
  const cssKb = gzipSizeOf(path.join(clientDir, 'assets', cssFile)) / 1024;
  cssNote = ` (not counted; app.css alone is ${cssKb.toFixed(1)} KB gzipped)`;
}

let failed = false;
for (const { pathname, htmlGzipBytes, criticalJsBytes, scriptCount } of measured) {
  const totalKb = (htmlGzipBytes + criticalJsBytes) / 1024;
  const budgetKb = budgetKbFor(pathname);
  const ceilingKb = budgetKb * CI_SLACK;
  const verdict = totalKb <= ceilingKb ? 'PASS' : 'FAIL';
  if (verdict === 'FAIL') failed = true;
  console.log(
    `${pathname.padEnd(24)} HTML ${(htmlGzipBytes / 1024).toFixed(1)} KB gz` +
      ` + JS ${(criticalJsBytes / 1024).toFixed(1)} KB [${scriptCount} scripts]` +
      ` = ${totalKb.toFixed(1)} KB  ${verdict} (budget ${budgetKb} KB +10%)`,
  );
}
console.log(`Budgets:               public ${PUBLIC_BUDGET_KB} KB; entry ${ENTRY_BUDGET_KB} KB; results ${RESULTS_BUDGET_KB} KB (+10% CI slack)${cssNote}`);

if (!failed) {
  console.log('PASS');
  process.exit(0);
} else {
  console.error('FAIL — at least one page exceeds its route budget');
  process.exit(1);
}
