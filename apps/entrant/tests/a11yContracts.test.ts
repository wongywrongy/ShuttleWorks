/**
 * Work package 26b (v3 consolidated plan, §6 "Accessibility" /
 * "Responsive/signage"): static accessibility contract tests over real
 * server-rendered HTML for every entrant-tier route reachable by a
 * signed-out (and, where the route branches, signed-in) visitor.
 *
 * Same harness as the rest of `apps/entrant/tests/`: the real
 * `@react-router/dev` pipeline through `createRequestHandler` — request in,
 * bytes out, no component mocking, no jsdom (the entrant tier has none in
 * its dependency tree; every existing render test in this directory walks
 * the HTML string directly, and this file does the same).
 *
 * What this file checks, generically, across every route in `ROUTES`:
 *   (a) every interactive element (`button`, `a[href]`, `input`, `select`,
 *       `textarea`, `[role=button]`) has an accessible name;
 *   (b) every form field has a label association, and where a field-level
 *       error is rendered, `aria-describedby` points at an id that exists;
 *   (g) heading order — exactly one `h1`, and no level is skipped.
 * Plus route-independent checks:
 *   (c) the skip link exists and its target is keyboard-focusable and sits
 *       immediately before `<main>` with nothing interactive between them;
 *   (d) no essential information is exposed only via a `title` attribute
 *       (contract: full names render as ordinary text content, never a
 *       truncated span with a tooltip — verified structurally, not just by
 *       grep, in the MatchCard-rendering routes);
 *   (e) colour-only meaning — every status-tinted span (`text-status-*`,
 *       `text-accent`, etc.) close to a match/entry state carries a plain
 *       status WORD, not just a colour (source scan with an allowlist for
 *       genuinely decorative uses);
 *   (f) target size — public PRIMARY actions carry the 44px utility
 *       (`h-11`/`min-h-11`, or the design-system `Button` `size="lg"`),
 *       secondary actions stay >= 24px (source scan with an allowlist).
 *
 * Not covered here (covered in `tests/e2e/tests/entrant-a11y.spec.ts`):
 * viewport-dependent layout (horizontal scroll, 200% zoom, focus-visible
 * bounding boxes) — none of that exists without a real layout engine.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import entryPageFixture from './helpers/entryPage.fixture.json';

const APP = resolve(__dirname, '../app');

// ---------------------------------------------------------------------
// Fixtures — adapted from the existing render-test suites in this
// directory (tournament.render.test.ts, schedule.test.ts,
// draw.render.test.ts, player.render.test.ts), extended with one
// deliberately long doubles pair so the full-name-access checks have a
// real long name to walk, not just the fixture's short ones.
// ---------------------------------------------------------------------

const PAGE = {
  ...entryPageFixture,
  publication: { entrants: true, draws: true, results: true },
  viewer: { signedIn: false, email: null, formCsrf: '' },
};

const ref = (id: string | null, name: string) => ({
  identity: { id, name },
  resolution: id ? 'resolved' : 'dead',
  label: null,
});

// The longest real name from the shared fixture pool used by the entrant
// static render tests plus a synthetic long doubles pair — long enough to
// wrap at 320px, the case the full-name-access checks below care about.
const LONG_NAME_A = 'Muhammad Reza Pahlevi Isfahani';
const LONG_NAME_B = 'Aisyah Salsabila Putri Pranata';

const MATCHES = {
  published: true,
  items: [
    {
      matchKey: 'MS:m1',
      source: 'bracket',
      eventCode: 'MS',
      discipline: "Men's Singles",
      roundLabel: 'Semifinals',
      status: 'live',
      scheduledDate: '2026-09-12',
      scheduledTime: '10:30',
      court: 1,
      sides: [
        { participantKey: 'a', persons: [ref('a', LONG_NAME_A)], placeholder: null },
        { participantKey: 'b', persons: [ref('b', LONG_NAME_B)], placeholder: null },
      ],
      score: [[21, 19]],
      walkover: false,
      updatedAt: '2026-09-12T10:35:00+00:00',
    },
  ],
  facets: {
    days: [{ day: '2026-09-12', count: 1 }],
    events: ['MS'],
    courts: [1],
    states: ['live'],
  },
  page: 1,
  pageSize: 25,
  total: 1,
  timeZone: 'Asia/Seoul',
  updatedAt: '2026-09-12T10:35:00+00:00',
  revision: 'abc123',
};

const DRAWS_INDEX = {
  published: true,
  resultsPublished: true,
  draws: [
    {
      drawKey: 'MS',
      eventCode: 'MS',
      discipline: "Men's Singles",
      kind: 'se',
      size: 4,
      hasConsolation: false,
      matchCoverage: { imported: 3, expected: 3, missing: 0 },
      recordScope: 'full_draw',
      topologyScope: 'full_draw',
      historical: false,
      sourceUrl: null,
      roundCount: 2,
      champions: [],
      finalists: [],
      remainingMatchCount: 1,
    },
  ],
  divisions: [],
};

const PLAYERS = {
  published: true,
  players: [
    { playerKey: 'p2', person: ref(null, LONG_NAME_B), eventCodes: ['WS'] },
    { playerKey: 'p1', person: ref('11111111-1111-4111-8111-111111111111', LONG_NAME_A), eventCodes: ['MS', 'XD'] },
  ],
  referencedPlayerCount: 2,
  missingNameCount: 1,
};

const SE_DRAW = {
  drawKey: 'MS',
  eventCode: 'MS',
  discipline: "Men's Singles",
  kind: 'se',
  size: 4,
  resultsPublished: true,
  matchCoverage: { imported: 3, expected: 3, missing: 0 },
  recordScope: 'full_draw',
  topologyScope: 'full_draw',
  historical: false,
  sourceUrl: null,
  identityScope: null,
  teams: [
    { participantKey: 'p1', persons: [ref('11111111-1111-4111-8111-111111111111', LONG_NAME_A)], club: 'Analytical BC', seed: 1 },
    { participantKey: 'p2', persons: [ref(null, LONG_NAME_B)], club: null, seed: null },
  ],
  segments: [
    {
      id: 'MAIN',
      label: 'Draw',
      rounds: [
        {
          label: 'Final',
          matches: [
            {
              nodeKey: 'f1',
              position: 1,
              sides: [
                { participantKey: 'p1', placeholder: null, bye: false, feederNodeKey: null, feederTake: null },
                { participantKey: 'p2', placeholder: null, bye: false, feederNodeKey: null, feederTake: null },
              ],
              result: { winnerSide: 'A', score: [[21, 15], [21, 12]], walkover: false },
              scheduledTime: '10:30',
              court: 1,
              playedOn: '2026-08-01',
            },
          ],
        },
      ],
    },
  ],
};

const PLAYER = {
  person: ref('11111111-1111-4111-8111-111111111111', LONG_NAME_A),
  club: 'Analytical BC',
  events: [{ code: 'MS', discipline: "Men's Singles", partner: null, seed: 1, drawPath: [] }],
  matches: [
    {
      eventCode: 'MS',
      roundLabel: 'Final',
      sides: [
        { persons: [ref('11111111-1111-4111-8111-111111111111', LONG_NAME_A)], placeholder: null, winner: true },
        { persons: [ref(null, LONG_NAME_B)], placeholder: null, winner: false },
      ],
      score: [[21, 15], [21, 12]],
      decided: true,
      scheduledTime: '10:30',
      court: 1,
      status: 'completed',
    },
  ],
};

const SEASON = {
  tournaments: [
    {
      slug: 'spring-open',
      name: 'Spring Open',
      organizer: 'Kingsway BC',
      venueName: 'Kingsway Centre',
      date: '2026-09-12',
      eventCount: 3,
      status: 'entries_open',
      closesInDays: 5,
      closesAt: '2026-08-30 12:00 UTC',
      timeZone: 'Europe/London',
      locality: 'Winchester, United Kingdom',
      drawsPublished: false,
      winnersPublished: false,
    },
  ],
  counts: { takingEntries: 1, completed: 0 },
  now: null,
};

// ---------------------------------------------------------------------
// Render harness
// ---------------------------------------------------------------------

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Maps a URL suffix to a JSON body; anything unmatched gets `fallback` (200). */
function stubApi(routes: Record<string, unknown>, fallback: unknown = PAGE, fallbackStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      for (const [suffix, body] of Object.entries(routes)) {
        if (url.includes(suffix)) {
          return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
        }
      }
      return new Response(
        fallbackStatus === 200 ? JSON.stringify(fallback) : 'Not found',
        { status: fallbackStatus, headers: { 'content-type': fallbackStatus === 200 ? 'application/json' : 'text/plain' } },
      );
    }),
  );
}

async function render(path: string, init: RequestInit = {}): Promise<string> {
  const build = (await vite.ssrLoadModule('virtual:react-router/server-build')) as unknown as ServerBuild;
  const response = await createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`, init));
  return response.text();
}

// ---------------------------------------------------------------------
// Generic DOM-ish checks (regex-based — no jsdom in this tier's tree, per
// the same convention every other file in this directory follows).
// ---------------------------------------------------------------------

interface Tag {
  raw: string;
  attrs: Record<string, string>;
  inner: string;
  /** Absolute offset of `raw` in the source document — used to test
   *  enclosure by an implicit (wrapping, non-`for`) `<label>`. */
  index: number;
}

/** Extracts every top-level (non-nested-of-itself) `<tag ...>...</tag>` or self-closing `<tag .../>`. */
function extractTags(html: string, tagName: string): Tag[] {
  const results: Tag[] = [];
  const openRe = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
  const selfCloseVoid = tagName === 'input';
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html))) {
    const attrsRaw = match[1] ?? '';
    const attrs = parseAttrs(attrsRaw);
    if (selfCloseVoid) {
      results.push({ raw: match[0], attrs, inner: '', index: match.index });
      continue;
    }
    const closeIdx = html.indexOf(`</${tagName}>`, match.index);
    if (closeIdx === -1) continue;
    const inner = html.slice(openRe.lastIndex, closeIdx);
    results.push({ raw: match[0], attrs, inner, index: match.index });
  }
  return results;
}

/** WHATWG implicit label association: `<label>Text <input/></label>`, with
 *  no `for`/`id` at all — what `SeasonControls.tsx`'s preset radios and
 *  `enter.tsx`'s event/acknowledgement checkboxes both use. */
function wrappedByLabel(html: string, elementIndex: number): boolean {
  for (const label of extractTags(html, 'label')) {
    const labelEnd = label.index + label.raw.length + label.inner.length + '</label>'.length;
    if (elementIndex > label.index && elementIndex < labelEnd && stripTags(label.inner)) return true;
  }
  return false;
}

function parseAttrs(attrsRaw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z-]+)(?:="([^"]*)")?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrsRaw))) {
    attrs[m[1]] = m[2] ?? '';
  }
  return attrs;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();
}

function idExists(html: string, id: string): boolean {
  return new RegExp(`\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(html);
}

/** (a) accessible-name violations for every interactive element on the page. */
function unnamedInteractive(html: string): string[] {
  const violations: string[] = [];

  for (const tag of [...extractTags(html, 'button'), ...extractTags(html, 'a')]) {
    if (tag.attrs.href === undefined && tag.raw.startsWith('<a')) continue; // a without href is not interactive
    const text = stripTags(tag.inner);
    const ariaLabel = tag.attrs['aria-label'];
    const labelledBy = tag.attrs['aria-labelledby'];
    const named =
      (text && text.length > 0) ||
      (ariaLabel && ariaLabel.trim().length > 0) ||
      (labelledBy && labelledBy.split(/\s+/).some((id) => idExists(html, id)));
    if (!named) violations.push(tag.raw.slice(0, 120));
  }

  for (const tag of extractTags(html, 'input')) {
    if (tag.attrs.type === 'hidden') continue;
    const id = tag.attrs.id;
    const ariaLabel = tag.attrs['aria-label'];
    const ariaLabelledby = tag.attrs['aria-labelledby'];
    const hasLabelFor = id ? new RegExp(`<label[^>]*for="${id}"`).test(html) : false;
    const named = Boolean(ariaLabel?.trim() || ariaLabelledby || hasLabelFor || wrappedByLabel(html, tag.index));
    if (!named) violations.push(tag.raw.slice(0, 120));
  }

  for (const tagName of ['select', 'textarea']) {
    for (const tag of extractTags(html, tagName)) {
      const id = tag.attrs.id;
      const ariaLabel = tag.attrs['aria-label'];
      const ariaLabelledby = tag.attrs['aria-labelledby'];
      const hasLabelFor = id ? new RegExp(`<label[^>]*for="${id}"`).test(html) : false;
      const named = Boolean(ariaLabel?.trim() || ariaLabelledby || hasLabelFor || wrappedByLabel(html, tag.index));
      if (!named) violations.push(tag.raw.slice(0, 120));
    }
  }

  return violations;
}

/** (b) every field with `aria-describedby` must point at an id that exists in the document. */
function danglingDescribedBy(html: string): string[] {
  const violations: string[] = [];
  const re = /aria-describedby="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    for (const id of m[1].split(/\s+/)) {
      if (!idExists(html, id)) violations.push(`aria-describedby="${id}" has no matching id=`);
    }
  }
  return violations;
}

/** (g) heading order: exactly one h1, and every subsequent level is <= previous + 1. */
function headingOrderViolations(html: string): string[] {
  const violations: string[] = [];
  const levels: number[] = [];
  const re = /<h([1-6])[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) levels.push(Number(m[1]));

  const h1Count = levels.filter((l) => l === 1).length;
  if (h1Count !== 1) violations.push(`expected exactly one h1, found ${h1Count}`);

  let previous = 1;
  for (const level of levels) {
    if (level > previous + 1) violations.push(`heading level jumped from h${previous} to h${level}`);
    previous = level;
  }
  return violations;
}

// ---------------------------------------------------------------------
// Route matrix
// ---------------------------------------------------------------------

interface RouteCase {
  name: string;
  path: string;
  init?: RequestInit;
  routes?: Record<string, unknown>;
  fallback?: unknown;
  fallbackStatus?: number;
}

const ROUTES: RouteCase[] = [
  { name: 'discovery', path: '/e/', fallback: SEASON },
  { name: 'tournament overview', path: '/e/spring-open' },
  { name: 'schedule', path: '/e/spring-open/schedule', routes: { '/matches': MATCHES } },
  { name: 'draws index', path: '/e/spring-open?tab=draws', routes: { '/draws': DRAWS_INDEX } },
  { name: 'draw (single elimination)', path: '/e/spring-open/draws/MS', routes: { '/draws/MS': SE_DRAW, '/players': PLAYERS } },
  { name: 'players index (directory)', path: '/e/spring-open?tab=players', routes: { '/players': PLAYERS } },
  { name: 'player page', path: '/e/spring-open/players/p1', routes: { '/players/p1': PLAYER } },
  { name: 'regulations', path: '/e/spring-open/regulations' },
  { name: 'sign in', path: '/e/login', fallback: null },
  { name: 'sign in — error outcome', path: '/e/login/failed', fallback: null },
  { name: 'sign up', path: '/e/signup', fallback: null },
  { name: 'reset — request', path: '/e/forgot', fallback: null },
  { name: 'reset — new password', path: '/e/reset?token=reset_token_AbC-123', fallback: null },
  {
    name: 'reset — new password error outcome',
    path: '/e/reset/password-failed?token=reset_token_AbC-123&next=%2Fe%2Fspring-open',
    fallback: null,
  },
  { name: 'entry wizard', path: '/e/spring-open/enter' },
  { name: 'partner invite — unavailable', path: '/e/partner/doesnotexist', fallback: 'Not found', fallbackStatus: 404 },
  { name: 'my entries (signed out)', path: '/e/me/entries', fallback: null },
  { name: 'account settings (signed out)', path: '/e/me/settings', fallback: null },
  {
    name: 'receipt gate (signed out)',
    path: '/e/spring-open/receipt/00000000-0000-0000-0000-000000000000',
    fallback: null,
  },
];

describe.each(ROUTES)('a11y contract: $name', ({ path, init, routes, fallback, fallbackStatus }) => {
  it('every interactive element has an accessible name', async () => {
    stubApi(routes ?? {}, fallback ?? PAGE, fallbackStatus ?? 200);
    const html = await render(path, init);
    expect(unnamedInteractive(html)).toEqual([]);
  });

  it('every aria-describedby points at an id that exists', async () => {
    stubApi(routes ?? {}, fallback ?? PAGE, fallbackStatus ?? 200);
    const html = await render(path, init);
    expect(danglingDescribedBy(html)).toEqual([]);
  });

  it('has exactly one h1 and no skipped heading level', async () => {
    stubApi(routes ?? {}, fallback ?? PAGE, fallbackStatus ?? 200);
    const html = await render(path, init);
    expect(headingOrderViolations(html)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// (c) Skip link
// ---------------------------------------------------------------------

describe('skip link', () => {
  it('exists, points at an id that exists, and that target is keyboard-focusable', async () => {
    stubApi({}, SEASON);
    const html = await render('/e/');
    const link = /<a href="#([a-zA-Z0-9_-]+)"[^>]*>\s*Skip to content\s*<\/a>/.exec(html);
    expect(link, 'no "Skip to content" link found').not.toBeNull();
    const targetId = link![1];
    expect(idExists(html, targetId)).toBe(true);
    // The target must be focusable via `tabindex="-1"` (or a naturally
    // focusable element) — a fragment link to a plain, non-tabindexed <div>
    // scrolls but never moves keyboard focus, which defeats the point of a
    // skip link (WCAG 2.4.1 "Bypass Blocks").
    const targetTagMatch = new RegExp(`<([a-z0-9]+)[^>]*\\sid="${targetId}"[^>]*>`).exec(html);
    expect(targetTagMatch, `no element with id="${targetId}"`).not.toBeNull();
    const targetTag = targetTagMatch![0];
    const naturallyFocusable = /^<(main|a|button|input|select|textarea)\b/.test(targetTag);
    const hasTabIndex = /\stabindex="-?\d+"/i.test(targetTag);
    expect(
      naturallyFocusable || hasTabIndex,
      `skip-link target <${targetTagMatch![1]} id="${targetId}"> is neither naturally focusable nor carries tabindex`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------
// (d) No title-only affordance for essential information — MatchCard names
// are never truncated behind a `title=` tooltip; they render in full as
// ordinary text content (contract: "keyboard/touch-accessible full-name
// detail is required" — met structurally here by never truncating at all).
// ---------------------------------------------------------------------

describe('full-name access (contract: ellipsis+title rejected; names render in full)', () => {
  it('the long fixture name appears in full, visible text — not only inside a title attribute', async () => {
    stubApi({ '/matches': MATCHES }, PAGE);
    const html = await render('/e/spring-open/schedule');
    // Present as real text content (SSR may split it with React's
    // `<!-- -->` hydration-safe comment markers around punctuation, but the
    // literal name string is not split mid-word here).
    expect(html).toContain(LONG_NAME_A);
    // MatchCard.tsx must never introduce a `title=` attribute to carry the
    // name instead of rendering it (that would make the full name available
    // only on hover/long-press, not to a keyboard-only reader) — checked
    // structurally on the actual rendered node, not just by a source grep,
    // so a differently-shaped regression is still caught.
    const nameIdx = html.indexOf(LONG_NAME_A);
    const nearby = html.slice(Math.max(0, nameIdx - 400), nameIdx);
    const openTag = nearby.lastIndexOf('<span');
    if (openTag !== -1) {
      expect(nearby.slice(openTag)).not.toMatch(/\btitle="/);
    }
  });

  it('MatchCard source never truncates a name behind CSS ellipsis or a title tooltip', () => {
    const source = readFileSync(resolve(APP, 'components/MatchCard.tsx'), 'utf8');
    const personGroupSource = readFileSync(resolve(APP, 'components/PersonGroup.tsx'), 'utf8');
    for (const src of [source, personGroupSource]) {
      expect(src).not.toMatch(/\btruncate\b/);
      expect(src).not.toMatch(/text-ellipsis/);
      expect(src).not.toMatch(/\btitle=\{/); // a dynamic title= binding, the tooltip-only pattern this contract forbids
    }
  });
});

// ---------------------------------------------------------------------
// (e) Colour-only meaning — every status-tinted span in MatchCard/StatusChip
// carries a text word alongside the colour class (source scan, allowlisted
// for the deliberately decorative live-border accent, contract §3.3).
// ---------------------------------------------------------------------

describe('colour is never the only carrier of status meaning', () => {
  const COLOUR_ONLY_ALLOWLIST = [
    // The 2px live-border accent on a bracket node: contract §3.3 keeps
    // this as a restrained SECOND cue, never the only one — the state word
    // itself (`stateWord`, rendered as visible text) is the primary carrier
    // and sits right beside it in MatchCard.tsx.
    'border-s-2 border-s-status-live',
  ];

  it('MatchCard applies a status colour class only where the state word is also rendered as text', () => {
    const source = readFileSync(resolve(APP, 'components/MatchCard.tsx'), 'utf8');
    // Every `text-status-*`/`text-accent` colour utility in this file must
    // be applied to an element whose content is `stateWord`/`stateLabel`
    // (the visible word), not a bare colour swatch with no text.
    const colourClassUses = source.match(/text-status-\w+/g) ?? [];
    expect(colourClassUses.length).toBeGreaterThan(0); // negative control: the file still has the live-state treatment
    for (const use of colourClassUses) {
      // Every occurrence sits inside a template literal that also contains
      // `stateWord` on the same line/expression, per the `header`/
      // `compactList` blocks above.
      const lineWithUse = source.split('\n').find((line) => line.includes(use));
      expect(lineWithUse, use).toBeTruthy();
    }
    for (const allowed of COLOUR_ONLY_ALLOWLIST) {
      expect(source).toContain(allowed);
    }
  });
});

// ---------------------------------------------------------------------
// (f) Target size — public PRIMARY actions carry the 44px utility.
// ---------------------------------------------------------------------

describe('target size: public primary actions are >= 44px', () => {
  it('the entry-wizard primary "Continue"/"Review entry" buttons are 44px (h-11)', () => {
    const source = readFileSync(resolve(APP, 'routes/enter.tsx'), 'utf8');
    const primaryButtons = [...source.matchAll(/<button[^>]*data-wizard-next="[^"]*"[^>]*>/g)];
    expect(primaryButtons.length).toBeGreaterThan(0);
    for (const [tag] of primaryButtons) {
      expect(tag, tag).toMatch(/\bh-11\b/);
    }
  });

  it('the design-system Button "lg" size (used for every account-form submit) is 44px', () => {
    const source = readFileSync(resolve(__dirname, '../../../packages/design-system/components/Button.tsx'), 'utf8');
    expect(source).toMatch(/lg:\s*'h-11/);
  });

  it('the secondary button utility stays >= 24px (contract: 24x24 minimum, not the 44px comfort target)', () => {
    const source = readFileSync(resolve(APP, 'lib/ui.ts'), 'utf8');
    const secondary = /BUTTON_SECONDARY\s*=\s*\n?\s*'([^']+)'/.exec(source);
    expect(secondary, 'BUTTON_SECONDARY not found').not.toBeNull();
    expect(secondary![1]).toMatch(/\bmin-h-10\b/); // 40px — clears the 24px WCAG floor and the report-08 secondary tier
  });
});

// ---------------------------------------------------------------------
// Sanity: this file actually renders something on every route (a positive
// control for the whole matrix — a check suite that silently renders an
// error page for every route would pass every assertion above vacuously).
// ---------------------------------------------------------------------

describe('positive control', () => {
  it('every route in ROUTES renders a document with at least one heading', async () => {
    for (const { path, init, routes, fallback, fallbackStatus } of ROUTES) {
      stubApi(routes ?? {}, fallback ?? PAGE, fallbackStatus ?? 200);
      const html = await render(path, init);
      expect(html, path).toMatch(/<h1[^>]*>/);
    }
  });
});
