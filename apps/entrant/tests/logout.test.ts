/**
 * Signing out — the form in the footer of `/e/{slug}`, and nothing else.
 *
 * There is no `/e/logout` page. There was, for one commit; it minted its own
 * `sw_play_csrf` nonce at `Path=/`, and by the documented last-issuance-wins
 * rule that invalidated the token of a half-filled entry form open in another
 * tab — one Back click from a 403 "This form has expired". The entry page is
 * the only page a signed-in entrant is on, it already mints the nonce and
 * already exports `headers`, so the control collapsed into six lines of its
 * footer: a plain `<form method="post">` reusing the token the document has
 * already rendered. One fewer route to enumerate, one fewer nonce channel.
 *
 * Same shape as `login.test.ts`: the REAL @react-router/dev pipeline through
 * `createRequestHandler`, request in, HTML out, no component mocking. What is
 * asserted is the bytes a scriptless browser receives.
 *
 * Logout's whole security weight sits in one place: **it must be a POST, and
 * only a POST.** A GET logout is CSRF-able by construction — an `<img src>`, a
 * link prefetch, or a scanner walking the site signs the entrant out — and it
 * is exactly the kind of harmless-looking convenience that ships. So:
 *
 * 1. The document's only reference into `/e/account/` is a `method="post"`
 *    form, and no route module on disk holds a link or a non-POST form action
 *    reaching that prefix. That half is derived from every route file, not
 *    listed, so a link — or a `<form method="get">` — pasted tomorrow is a
 *    finding without a line being added here.
 * 2. The `_csrf` field carries the digest of the `sw_play_csrf` nonce set on
 *    this very response — the same channel the entry form beside it uses, and
 *    the one `logout_form_csrf` (`api/entrants.py:271`) accepts. Node never
 *    reads the session cookie, so a session-derived digest is not available to
 *    it and the nonce is the whole proof-of-intent.
 * 3. `next` is rendered unconditionally. `logout`'s own fallback is
 *    `/e/account/login` (`api/entrants.py:569`), which is POST-only — a 405 in
 *    the entrant's face after a *successful* logout. The form therefore always
 *    names a node-owned GET.
 *
 * **What this file cannot hold, and where it lives instead.** The POSITIVE
 * path — that the form's POST really logs out — and the strong reading of
 * "logged out" are proved against the real backend in
 * `tests/backend/test_entrant_auth_routes.py`
 * (`test_a_form_logout_kills_the_session_and_lands_on_a_node_owned_get`),
 * which replays the pre-logout token from a jar cleared and rebuilt by hand —
 * something no `Set-Cookie` can fake — and requires a 401. Delete
 * `revoke_session` from `logout` and that replay flips back to 200 while the
 * 303 and `Location` stay green. A cleared cookie over a live session row is
 * no logout at all: anyone still holding the token still holds the account.
 *
 * The document's `Cache-Control: no-store` is pinned for every minting route,
 * this one included, in `entry.loader.test.ts`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { FORM_FIELD } from '../app/lib/formField';
import { formCsrfToken } from '../app/lib/formCsrf.server';
import { componentFiles, readAppSource, routeFiles } from './helpers/sourceGuards';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchPath(path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
}

/** The tag that declares `name`, whatever order React serialised it in. */
const inputNamed = (html: string, name: string) =>
  html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

/** Every `href` in the document, so the link controls derive rather than list. */
const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/** Just the sign-out form, so assertions cannot be satisfied by the entry
 * form that shares the page (and shares the token). */
const logoutForm = (html: string) =>
  html.match(/<form[^>]*action="\/e\/account\/logout"[^>]*>[\s\S]*?<\/form>/)?.[0] ?? '';

/**
 * Lines that reach the backend's account prefix by any route OTHER than a POST
 * form.
 *
 * Two shapes, because there are two ways to get it wrong and a guard that sees
 * one of them is not a guard:
 *
 * - `href="…"` and `href={…}` — a link. Both JSX spellings, because the entry
 *   page writes the template-literal form.
 * - `action=…` on a line that is not `method="post"` — a GET form, which is
 *   the same defect wearing a button: the browser turns the fields into a
 *   query string and any prefetch, scanner or `<img>` that reaches the URL
 *   signs the entrant out. This half was missing until the Task 21 review:
 *   the `method="get"` control inspected only one document, so a GET form
 *   added to any other route file passed clean.
 *
 * Every `<form …>` OPENING TAG is collapsed onto one line first, so the
 * exemption is a property of the tag rather than of how it happens to be
 * wrapped. Without that, `signup.tsx` — which writes `method` and `action` on
 * separate lines — was a false positive the moment this widened, which is how
 * the collapse got written.
 */
const accountRefLines = (source: string): string[] =>
  source
    .replace(/<form\b[^>]*>/g, (tag) => tag.replace(/\s+/g, ' '))
    .split('\n')
    .filter((line) => {
      if (/href=\{?[`'"][^`'"]*\/e\/account\//.test(line)) return true;
      return (
        /action=\{?[`'"][^`'"]*\/e\/account\//.test(line) && !/method="post"/.test(line)
      );
    })
    .map((line) => line.trim());

describe('the sign-out form, unhydrated', () => {
  it('is a plain form posting straight to the FastAPI logout route', async () => {
    const form = logoutForm(await fetchEntry());

    expect(form).toMatch(/^<form[^>]*method="post"/);
    // A form with no submit control cannot be submitted without script, which
    // every other assertion here would sail straight past.
    expect(form).toMatch(/<button[^>]*type="submit"/);
  });

  it('offers no way to sign out with a GET', async () => {
    // The property this control exists to get right. The document DOES carry
    // GET forms now (discovery's header search), so the assertion is scoped
    // to where it bites: no GET-shaped form may target the account prefix,
    // and no link may reach it at all.
    const html = await fetchEntry();

    const accountForms = (html.match(/<form[^>]*action="\/e\/account\/[^"]*"[^>]*>/g) ?? []);
    expect(accountForms).toHaveLength(1);
    expect(accountForms[0]).toMatch(/method="post"/i);
    expect(hrefs(html).filter((h) => h.startsWith('/e/account/'))).toEqual([]);
  });

  it('is not dressed as the page’s primary action (E4)', async () => {
    // This page cannot know who is reading it, so "Sign out" is rendered
    // unconditionally and is wrong in one direction or the other — a
    // signed-out visitor is offered a control that does nothing for them.
    // The shipped answer to that, on the copy beside it, is to HEDGE
    // ("Signed in on this device?"), and the weight has to match the hedge:
    // primary weight on a control the page cannot know applies is the same
    // over-claim in CSS.
    //
    // Derived from the design system rather than spelled: `shadow-glow` is
    // what the `default`/`brand` variants add and nothing else does
    // (`packages/design-system/components/Button.tsx`), so this asks "is it
    // the glow button" without naming a class the page chose.
    const html = await fetchEntry();
    const signOut = logoutForm(html);

    expect(signOut).toMatch(/<button[^>]*type="submit"/);
    expect(signOut).not.toContain('shadow-glow');
    // Non-vacuity, and the positive half: the control is really rendered
    // through the design system and really picked the quiet variant —
    // `border-border-control` is `outline`'s chrome. Without this the
    // negative above would pass over a button with no classes at all.
    expect(signOut).toContain('border-border-control');
    // The copy half of the same argument, still in place.
    expect(html).toContain('Signed in on this device?');
  });

  it('carries the double-submit token as a hidden field named by FORM_FIELD', async () => {
    // The NAME is read from `FORM_FIELD` rather than pasted, so this really
    // pins "whatever node calls the field" and not one spelling of it. That
    // node's constant equals the backend's is a separate, cross-tier claim,
    // held by `tests/backend/unit/test_form_csrf_cross_tier.py`.
    const form = logoutForm(await fetchEntry());

    expect(form).toMatch(
      new RegExp(`<input[^>]*type="hidden"[^>]*name="${FORM_FIELD}"[^>]*value="[0-9a-f]{64}"`),
    );
  });

  it('renders a token that is the digest of the nonce it just set', async () => {
    // The end-to-end control, as on login: everything else can be green while
    // the form carries a token derived from a nonce nobody holds, which is
    // indistinguishable from inside node. `logout_form_csrf` accepts *either*
    // candidate secret, and the play nonce is the only one node can produce —
    // it never reads the session cookie.
    const res = await fetchEntryResponse();
    const form = logoutForm(await res.text());

    const setCookie = res.headers.get('set-cookie') ?? '';
    const nonce = /sw_play_csrf=([^;]+)/.exec(setCookie)?.[1];
    const rendered = new RegExp(`name="${FORM_FIELD}" value="([0-9a-f]{64})"`).exec(form)?.[1];

    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    expect(nonce).toBeTruthy();
    expect(rendered).toBe(formCsrfToken(nonce as string));
    // Non-vacuity: not two undefineds agreeing, and not the empty "no proof
    // available" value, which `require_form_csrf` refuses — shipping it would
    // make every unhydrated sign-out a refusal.
    expect(rendered).not.toBe('');
    expect(rendered).not.toBe(formCsrfToken('some-other-nonce'));
  });

  it('names a node-owned GET as the post-logout destination', async () => {
    // `logout`'s own fallback is `/e/account/login` (`api/entrants.py:569`),
    // which is POST-only: a successful sign-out would end on a 405. So the
    // field is rendered unconditionally, and the value is this page — a node
    // route, and the one that then offers "Sign in" again.
    const form = logoutForm(await fetchEntry());

    expect(inputNamed(form, 'next')).toContain('value="/e/spring-open"');
  });

  it('says what signing out does, and what it does not', async () => {
    // Copy, carried over from the deleted page: the scope of the action is
    // the thing an entrant most needs to know before clicking it.
    const form = logoutForm(await fetchEntry());

    expect(form).toContain('this device only');
    expect(form).toContain('already submitted');
  });
});

// ---- the derived half: one route file is not the tier ----------------------

describe('nothing in the tier reaches /e/account/ except by POST', () => {
  it.each([...routeFiles(), ...componentFiles()])(
    '%s reaches no /e/account/ URL by link or GET form',
    (relative) => {
      // **Derived from disk, not listed.** Every `/e/account/*` route is
      // POST-only (R8-A gives nginx the whole prefix), so an `<a href>` to one
      // is a 405 — and for logout specifically it is worse than a 405: were the
      // ingress ever to answer the GET, following a link, or submitting a GET
      // form, would sign the entrant out. A route or component file added
      // tomorrow is covered with no line added here.
      expect(accountRefLines(readAppSource(relative))).toEqual([]);
    },
  );

  it('the guard is not vacuous: links, both JSX spellings, and GET forms', () => {
    // Real fixture text of the exact defects, in the forms this codebase
    // writes. The benign POST line must survive, or the guard would forbid
    // the one thing signing out actually needs.
    const source = [
      '<a className="underline" href="/e/account/logout">Sign out</a>',
      '<a href={`/e/account/login?next=/e/${slug}`}>Sign in</a>',
      '<form method="get" action="/e/account/logout">',
      '<form action={`/e/account/login`}>',
      '<form method="post" action="/e/account/logout" className="flex gap-3">',
      // And the wrapped spelling `signup.tsx` actually uses: exempt for the
      // same reason, which is a property of the tag, not of the line breaks.
      '<form',
      '  method="post"',
      '  action="/e/account/signup"',
      '>',
    ].join('\n');

    expect(accountRefLines(source)).toEqual([
      '<a className="underline" href="/e/account/logout">Sign out</a>',
      '<a href={`/e/account/login?next=/e/${slug}`}>Sign in</a>',
      '<form method="get" action="/e/account/logout">',
      '<form action={`/e/account/login`}>',
    ]);
  });
});

// ---- the entry page fixture: it is the page under test now -----------------

/**
 * The entry page's document. Needs the real `GET /e/api/page/{slug}`
 * projection, so the shape is the one `entry.loader.test.ts` pins — trimmed to
 * the keys `entry.tsx` reads.
 */
async function fetchEntryResponse(): Promise<Response> {
  const { vi } = await import('vitest');
  process.env.API_BASE_URL = 'http://backend:8000';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(ENTRY_PAGE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  try {
    return await fetchPath('/e/spring-open/enter');
  } finally {
    vi.unstubAllGlobals();
  }
}

async function fetchEntry(): Promise<string> {
  const html = await (await fetchEntryResponse()).text();
  // The fixture really rendered — otherwise every assertion made against this
  // document is made against an error page with no forms at all.
  expect(html).toContain('Spring Open');
  return html;
}

const ENTRY_PAGE = Object.freeze({
  tournament: { name: 'Spring Open', date: '2026-09-12' },
  org: { name: 'Kingsway BC' },
  venue: { name: 'Kingsway Centre', address: '4 Kingsway' },
  page: {
    slug: 'spring-open',
    introText: null,
    regulationsText: null,
    regulationsVersion: 3,
    paymentInstructions: null,
    feeSchedule: {},
  },
  policy: {
    maxEventsPerPerson: 2,
    disciplineCaps: null,
    collectPhone: false,
    waiverRequired: false,
  },
  events: [],
  entrants: [],
  viewer: { signedIn: false, email: null, formCsrf: '' },
});
