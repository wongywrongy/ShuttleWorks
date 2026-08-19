# SP-P6-2 — Public site redesign: design document (Phase A audit + design)

> **Status:** design produced from the binding brief
> (`docs/superpowers/specs/2026-08-11-sp-p6-2-public-ia-brief.md`), 2026-08-11.
> The IA in that brief is binding and is not redesigned here; this document turns it into
> something Phase B/C can build without re-deciding anything. Every claim below carries a
> `file:line` citation or a live observation against the running demo stack
> (nginx `:8090`, backend `:8600`, 2026-08-11).
>
> **Phase B (static mockups) is gated on owner sign-off and does not start from this
> document alone.** The STOP items below need owner rulings first — two of them affect the
> three key mockup pages.

---

## 0. STOP — conflicts with the tree (owner decisions, not mine)

### STOP-1 — The signed-in states cannot exist on this tier as briefed

The brief specifies (§1) a signed-in discovery state — "the entrant hub — 'My tournaments'
strip first (their upcoming entries with submission state)" — plus (§3) a success-state
"link to My tournaments" and (§4) "existing pages (signup / login / **profile / my
tournaments**) … no functional change". Three independent facts in the tree contradict this:

1. **The pages do not exist.** The shipped route table is exhaustive
   (`entrant/app/routes.ts:9-85`): health, sitemap.xml, robots.txt, signup, login (+3
   outcome variants), `:slug/receipt/:submissionId`, `:slug/signed-in`, `:slug`. There is no
   profile page and no my-tournaments page to "re-skin with no functional change".
2. **The API does not exist.** The entrant account surface is `POST /e/account/{signup,
   login,logout}` + `GET /e/account/me` (`api/entrants.py:68,411,507,619,651` at HEAD) —
   nothing lists an account's submissions or entries. `find_for_account` exists only as a
   service used by the submit replay path (`services/submissions.py:175`); no route calls it
   for a listing. A login-gated "my entries" is E2, Phase 7
   (`docs/programs/SP-PROGRAM-1.md:246`).
3. **The architecture forbids the render even if the API existed.** Node "renders and never
   relays credentials": `apiFetch.server.ts:26-28` freezes an `accept`-only outbound header
   set, and the structural relay guard fails any route module whose source contains
   `cookie`, `headers.get(`, `credentials`, or a bare `fetch(`
   (`tests/helpers/sourceGuards.ts:112-144`, run over every file in `app/routes/` and
   `app/lib/`). The projection's `viewer.signedIn` is `false` for every reader of every
   server-rendered page (`api/entries_json.py:99-129`, pinned by
   `tests/test_entrant_ssr_contract.py`). And the tier ships zero client JS
   (`app/root.tsx:5-38`), so the browser cannot fetch the strip itself. **No page node
   renders can know or show who is reading.** The shipped outcome-route pattern
   (`/e/{slug}/signed-in`, `/e/login/created` — `routes.ts:37-81`) states *what just
   happened*, never *who you are*; a "My tournaments" strip is identity-shaped data, which
   that pattern cannot carry.

**Options (owner ruling required):**
- **(a) Defer the signed-in hub, My tournaments, and profile to the E2 program**
  (recommended — it is where the API arrives anyway). Discovery ships one state; success
  state links back to the tournament page and discovery.
- **(b)** Serve an identity-bearing page from FastAPI under `/e/account/` (FastAPI holds
  the session and R8-A already routes the prefix to it) — reintroduces the
  backend-rendered-HTML posture Phase 6 deliberately retired
  (`api/entries_public.py:3-12`).
- **(c)** Add a client-JS island with a CSP nonce — `root.tsx:31-33` documents exactly what
  that takes (nonce minted in `entry.server.tsx`, threaded into the nginx-owned header);
  it also reopens the page-weight budget and the no-JS posture (spec §7).

Phase B's "discovery (both auth states)" mockup depends on this ruling. Recommendation: mock
the strip anyway (mockups are the cheap place to look at it), labelled as the post-E2 state,
and ship only state (a)'s single-state discovery in Phase C.

### STOP-2 — R15 is cited by the brief but exists nowhere in the tree

The brief binds "rulings (R10–R15)" and twice references "R15 boundaries" /
"performance/stats surfaces (R15)". The program ledger transcribes **R10–R14 only**
(`docs/programs/SP-PROGRAM-1.md:56-114`); a full-tree search finds "R15" only inside this
brief. I cannot audit a boundary I cannot read. Owner: supply R15's text (or confirm it
means "performance/stats surfaces are out of scope", which is how this document treats it).

### STOP-3 — The entry-flow separation requires two backend redirect changes that are not read-only

Binding IA §3 moves the form to `/{slug}/enter`. Two backend write-path responses hardcode
the *old* form location as their `Location`:

- the quote's unhydrated 307 lands on `/e/{slug}[/signed-in]?…#enter`
  (`api/entries_json.py:614-629`, the `_echo_redirect` URL at `:627-629`) — the re-posted
  body must land on the route that renders the form, or the round trip renders nothing;
- an anonymous browser submit is 303'd to `/e/{slug}?refusalCode=NOT_SIGNED_IN#enter`
  (`entrant_or_back_to_form`, `api/entries_json.py:548-557`) — same problem.

Rule 7 says API contracts are "consumed, not modified", and these are redirect targets on
write paths — not the sanctioned "small read-only additions". The change itself is two
server-authored fixed strings (no attacker-chosen target enters either), but it is the
owner's to approve. **There is no decline path that preserves the binding IA**: if refused,
the form must stay on the tournament page and IA §3 does not ship. Listed as gate proposal
**G0** below so it is decided at the same gate as the read-only additions.

### STOP-4 — The discovery status model specifies facets the data cannot answer

The brief's filter rail (§1) is "status (Entries open · Upcoming · In play · Finished)" and
the chip vocabulary includes `Live` and `Finished`. The tree has **no public notion of a
tournament being in play or finished**: `tournaments.status` is operator lifecycle
(`draft/active/archived`, `models.py:110-113`) and is not in any entrant projection;
`tournaments.tournament_date` is a **nullable String(32)** holding an ISO date *by
convention only* (`models.py:122-124`), with no end date. "Entries open/closed" is fully
derivable (server-computed `isOpen`, `api/entries_json.py:302`); "Upcoming/Past" is
date-derivable where the date parses; "In play"/"Live" is at best `date == today` on a
single-date field — a weak claim wearing an animated dot. Gate proposal **G4** offers the
choices; my recommendation (see §9) is to trim `Live`/`Finished`/`In play` to the later
program that migrates Display's projections — they are the same "live data" family as the
excluded Draws/Schedule/Results tabs.

---

## 1. Phase A audit

### 1.1 The shipped SP-P6-1 pages, route by route

Route table: `entrant/app/routes.ts:9-85` (explicit config, not file-convention). Base:
the whole app mounts under `/e/` (`react-router.config.ts:16-20`, `vite.config.ts:18`).

| Route (under `/e/`) | Module | Loader's data | What renders |
|---|---|---|---|
| `health` | `routes/health.tsx:5-22` | static | liveness + a DS `<Button variant="brand">` as the standing SSR proof |
| `sitemap.xml` | `routes/sitemap.tsx:43-48` | `GET /e/api/pages` via 1-hour cache (`lib/sitemapCache.server.ts:136-147`) | XML resource route |
| `robots.txt` | `routes/robots.tsx:53-60` | static | `Disallow: /` then `Allow: /e/` (origin-root aliased in nginx) |
| `signup` | `routes/signup.tsx:85-100,123-271` | `GET /e/api/config` + `mintFormCsrf()` | centered column: heading, Turnstile no-JS notice, form posting to `/e/account/signup` |
| `login` (+`/created`, `/failed`, `/signed-in`) | `routes/login.tsx:179-193,212-341` | `mintFormCsrf()`, one query param (`next`) | centered column; outcome banners keyed off which path matched |
| `:slug` (+`:slug/signed-in`) | `routes/entry.tsx:97-138,262-464` | one call, `GET /e/api/page/{slug}` | h1/date/venue header, events `<ul>`, sign-in links, the whole entry form, regulations, payment, entrant `<ul>`, sign-out footer |
| `:slug/receipt/:submissionId` | `routes/receipt.tsx:95-133,135-177` | same projection, narrowed to 2 fields (`:67-70`) | heading, reference card, payment, back link |
| *(no index route)* | — | — | **`GET /e/` today answers 200 with an empty body shell** (observed live on `:8090`: root document, `<body><!--$--><!--/$--></body>`) — a blank page at the app root |

**Assessment of the brief's charge** ("used design tokens but no page system; they read as
documents"): **I agree, with one qualification.** The entry page is a single
`max-w-3xl` column of `h1`/`h2` + `<ul>` lists (`entry.tsx:274-302,394-402`); receipt,
login and signup are narrow stacks; there is no hero, no tab structure, no card grid, no
status vocabulary (the events list renders literal `— Open ·` text, `entry.tsx:296-299`);
live render confirms it (text-flow extraction of `/e/dave-freeman-jr-2026`, 2026-08-11: a
continuous document, 0 `<script>` tags, 18 140 bytes of HTML). The qualification: the pages
are not careless — they use DS primitives (`Button`, `Card`, `Notice`, `TextField`,
`Separator` — `entry.form.tsx:49-56`) and the *engineering* under them (CSRF mint, echo
parser, meta derivation, uniform 404) is the strongest part of SP-P6-1 and must carry over
untouched. The redesign is a page-system problem, not a rebuild-the-plumbing problem.

### 1.2 The API surface, field by field (reconciled against shipped code + live responses)

**`GET /e/api/page/{slug}`** — `EntryPageProjection` (`api/entries_json.py:195-206`,
route `:230-314`), mirrored exactly by `entrant/app/lib/entryPage.types.ts:20-91`. Verified
live against `/e/api/page/dave-freeman-jr-2026` on `:8600`. Public; unknown slug and
`is_open=False` page answer one uniform 404 (`api/entries_public.py:83-102`).

| DTO | Fields (exact) | Notes for this IA |
|---|---|---|
| `tournament` | `name: str?`, `date: str?` | `date` is the raw `tournament_date` string (`entries_json.py:255-261`) — nullable, unvalidated ISO |
| `org` | `{name}` or null | organizer line in the hero |
| `venue` | `name: str?`, `address: str?` | no structured locality — "venue locality" on cards must be `venue.name` or a parse the design must not attempt |
| `page` | `slug`, `introText?`, `regulationsText?`, `regulationsVersion: int`, `paymentInstructions?`, `feeSchedule: {str→int¢}` | feeds Overview cards; `feeSchedule` normalized server-side (`:275-281`) |
| `policy` | `maxEventsPerPerson?`, `disciplineCaps?`, `collectPhone: bool`, `waiverRequired: bool` | stated-rule copy on the enter page |
| `events[]` | `id`, `code`, `discipline`, `feeCents?`, `genderConstraint?`, `opensAt?`, `closesAt?`, `withdrawsUntil?`, `isOpen: bool`, `ageBracketed: bool`, `entryCount: int` | **`cap` is NOT here** though the model has it (`models.py:1391`) → G2. Moments are display strings `"%Y-%m-%d %H:%M UTC"` (`entries_public.py:192-200`) → G3. `isOpen`/`ageBracketed`/`entryCount` are server-computed and must never be re-derived (`entryPage.types.ts:8-13`) |
| `entrants[]` | `{name}` — one column, one row per person | strict I6 projection (`entries_public.py:124-166`); event ids deliberately dropped in the 2026-08-10 dedup (`:139-143`); club exists on the model (`models.py:1340`) but is structurally absent → G5 |
| `viewer` | `signedIn`, `email?`, `formCsrf` | **always `false`/`null`/`""` on every SSR page** (`entries_json.py:105-115`); no design element may gate on it |

**`GET /e/api/pages`** — `[{slug}]` and *nothing else* (`api/entries_json.py:337-338,
341-366`), filtered to `is_open` in SQL, ordered by slug. Verified live:
`[{"slug":"dave-freeman-jr-2026"},{"slug":"dfw-lewisville-2026"}]`. **The working
assumption that it returns `{slug, updatedAt}` is wrong — there is no `updatedAt`.** This
route cannot feed a tournament card → G1.

**`GET /e/api/config`** — `{turnstileSiteKey, authMode}` (`:209-226,317-334`). Signup only.

**`POST /e/api/quote/{slug}`** — session-gated (R8-C, `:632-646`); browser `Accept:
text/html` → **307** back to the form URL with only server-computed keys in the query
(`totalCents`, `refusalCode`, `refusalSubjects`, the `/signed-in` variant flag —
`:614-629`); JSON callers get `QuoteResponse{totalCents?, feeBasis, refusal?}` (`:446-457`).
An anonymous browser pressing the quote button still gets a raw JSON 401 — a named,
accepted cost (`:636-645`).

**`POST /e/api/submit/{slug}`** — guard order is the contract (`:711-751`); Idempotency-Key
from header or the hidden `idempotencyKey` field (`:811`); answers **303** to
`/e/{slug}/receipt/{submissionId}?totalCents=…` (`:857-862`); replay answers the same
receipt (`:838-855`).

**`/e/account/*`** — `POST signup|login|logout`, `GET me` (`api/entrants.py` at HEAD:
`:411,507,619,651`). Forms post to these directly across the tier boundary; node exports no
actions for them (`signup.tsx:19-25`, `login.tsx:16-23`).

### 1.3 The design system's real primitives

`packages/design-system/components/index.ts:15-49`: `Button` (+variants incl. `brand`,
`outline`), `Card` family, `Select` (Radix — **cannot submit unhydrated**, already ruled
out for this tier, `entry.form.tsx:38-42`), `TextField`, `CourtMark`, `Separator`,
`StatusPill`, `StatusBar`, `Modal` (browser-only, out — `health.tsx:14-16`), `Notice`
(tones `info|warning|danger|success|accent`, `Notice.tsx:21`), `Hint`, `Toast` (both
hook/JS-driven — out), `GanttTimeline` (out).

- **`TextField` is the canonical input** and SSRs correctly (`entry.form.tsx:40-42`), but
  its password reveal is a `type="button"` with `onClick`
  (`TextField.tsx:111-133`) — inert on a zero-JS tier. The shipped pages already opt out
  with `revealable={false}` (`login.tsx:314-324`, `signup.tsx:216-218`); **every password
  field in this redesign must keep that opt-out.**
- **`StatusPill`** (`StatusPill.tsx:28-88`) is tone-mapped onto the `--status-*` ladder
  with an optional `dot`/`pulse` — it is the raw material for `StatusChip`, but its
  register is the operator's (uppercase micro-label). `StatusChip` should wrap it (or
  restyle the same tokens) rather than invent a palette.
- **Tokens** cover everything the inventory needs: semantic status ramps
  (`tokens.css:264-271,316-334`), spacing (`:125-135`), radius (`:138-143`), motion +
  easing (`:146-161`), `sw-pulse` (used by `StatusPill.tsx:81`).
- **Genuinely new** (no primitive exists): `DateBadge`, `TournamentCard`,
  `FilterRail`/`FilterSheet`, `HeroHeader`, `TabBar` (public), `TimelineCard`, `FeeTable`,
  `EventRow`, `EntrantsList`, `StickyTotalBar`, `EmptyState`. All are markup+tokens
  compositions — none needs a dependency.
- New components live in `entrant/app/components/` — a directory the structural guards do
  **not** currently enumerate (`sourceGuards.ts:28-48` lists `routes/` and `lib/` only).
  **The guards must grow a `components` entry in the same change that creates the
  directory**, or the tier's primary controls go blind to its newest code.

### 1.4 The hard constraints (verbatim, with the receipts)

1. **Zero client JavaScript.** `<Scripts/>` deliberately absent (`root.tsx:5-38`); CSP is
   `script-src 'self'` with no inline/nonce (`frontend/security-headers.conf`, CSP
   add_header; the one exception is Turnstile's origin on `/e/signup` only, by nginx map —
   `nginx.conf` `$sw_turnstile_origin`). Live check: rendered entry page has 0 `<script>`.
2. **Page-weight gate: 4 KB gzipped, blocking**, measured on the rendered `/e/{slug}`
   document + any referenced scripts (`scripts/measure-page-weight.mjs:119-152`; budget
   derivation `:124-131`; current measurement 2.5 KB). The redesigned tournament page IS
   this measured page → G6 books a re-derivation, R8-F precedent
   (`ENTRIES_PROGRESS.md:1074`).
3. **Node never relays credentials.** Frozen `accept`-only outbound allowlist
   (`apiFetch.server.ts:26-28,67-109` — path-validated `apiGet`, redirects refused, errors
   reduced to `{status, code}`); lexical relay guard over every route/lib file
   (`sourceGuards.ts:112-144`); nginx strips all but `sw_play_session`/`sw_play_csrf` from
   the Cookie header on every `/e/` path (`nginx.conf` cookie maps + `location /e/`).
4. **CSRF: the `_csrf` double-submit field is this tier's channel.** Node mints the
   `sw_play_csrf` nonce per rendered form and ships its sha-256 digest in the field
   (`lib/formCsrf.server.ts:150-170`); the backend accepts it as the second candidate
   secret (`api/entries_json.py:372-429`). Last-issuance-wins across the whole origin
   (`formCsrf.server.ts:126-136`) — a design that opens many form-bearing tabs multiplies
   "This form has expired"; the redesign keeps forms to the enter page + auth pages, as
   today.
5. **Reserved slugs are derived from the route table.** Every static top-level segment node
   declares must appear in the backend's `_RESERVED_SLUGS`
   (`tests/reservedSlugs.test.ts:37-84`); `api` and `account` are reserved without ever
   reaching node (`:69-74`). The new route plan adds **no top-level static segment**
   (discovery is the index route; `enter` is a sub-segment of `:slug`), so no backend
   reservation changes — and the Phase-B mock routes use dotted paths (`mock.discovery`)
   which the slug grammar can never collide with (same argument as `sitemap.xml`,
   `reservedSlugs.test.ts:33-41`).
6. **Loader/meta discipline.** Loaders read `request` for URL only; `headers()` must
   forward the mint's `Cache-Control: no-store` (`entry.tsx:180-198`); meta must never
   read `viewer` (`entry.tsx:200-221`); receipt-style narrowing applies to any loader that
   returns less than it fetched (`receipt.tsx:53-66`).
7. **No client fee rules.** `lib/money.ts:18-20` is the only money arithmetic;
   `tests/noClientFeeRules.test.ts` scans for violations. The sticky bar displays; it never
   computes.

### 1.5 R11 and the basename, reconciled

- **R11** (`SP-PROGRAM-1.md:79-83`): desktop and mobile co-equal; "no horizontal scrolling
  and no degraded functionality at either width"; brief rule 6 adds screenshots at both
  widths per page, filter rail → filter sheet at 390 px.
- **Basename:** the brief writes `/` and `/{slug}`; the shipped app mounts everything under
  `/e/` (`react-router.config.ts:19`, `vite.config.ts:18`) and the ingress split is
  by-prefix on one origin: `/e/api/` and `/e/account/` → FastAPI, everything else under
  `/e/` → node (`nginx.conf` `location /e/api/`, `/e/account/`, `/e/`). **The brief's `/`
  is `/e/` — the app's index route.** Discovery therefore lands inside the existing
  `location /e/` block: **zero nginx change, zero reserved-slug change.** A future `play.*`
  hostname (program Phase 11, R8-A) moves the basename in one config line and is out of
  scope (A2: no DNS). Bonus fixed en route: the blank 200 at `GET /e/` (audit §1.1)
  becomes the front door.

---

## 2. The gap list — gate proposals

Each is read-only and minimal except G0 (which is why G0 is also STOP-3). Every proposal
names its decline path; the page ships either way except where marked.

| # | What | Where | Why | Decline path |
|---|---|---|---|---|
| **G0** | Retarget two redirect `Location`s onto the enter page: `_echo_redirect` → `/e/{slug}/enter[/signed-in]?…#total` (`api/entries_json.py:627-629`) and `entrant_or_back_to_form` → `/e/{slug}/enter?refusalCode=NOT_SIGNED_IN#enter` (`:553-556`). Both stay server-authored fixed paths; the `?signedIn` presence flag mechanism (`:621-625`) is unchanged. | backend, write-path redirects | binding IA §3 moves the form; the 307 re-post must land on the route that renders it | **none that preserves the IA** — form stays on the tournament page |
| **G1** | Extend `GET /e/api/pages` items (additive): `name`, `tournamentDate` (raw string), `venueName`, `eventCount`, `entriesOpen: bool` (OR of `_event_is_open` over events — same helper the page uses), `entriesCloseAt: str?` (ISO; min `closes_at` over currently-open events, null if none carries one) | `api/entries_json.py:337-366` | discovery cards need name/date/venue/count/status; today the list is `{slug}` only (verified live) and feeding cards otherwise costs one `/e/api/page/{slug}` call per tournament | loader fans out N `GET /e/api/page/{slug}` calls per request (correct, `is_open`-safe, N+1 at local scale); sitemap cache is unaffected either way (`sitemapCache.server.ts:23-25` reads `slug` only) |
| **G2** | Add `cap: int?` to `EventDTO` | `api/entries_json.py:132-147` (model field exists, `models.py:1391`) | Events tab: "entered count (and cap when set)" is binding | Events rows show entered count only |
| **G3** | ISO-8601 moment fields: additive `opensAtIso`/`closesAtIso`/`withdrawsUntilIso` (or a ruling to switch `_moment` to ISO and format tier-side) | `api/entries_public.py:192-200`, `api/entries_json.py:295-301` | "closes in Nd", timeline position and date filtering need arithmetic on moments; today's wire format is the display string `"%Y-%m-%d %H:%M UTC"` | node parses the pinned format with a cross-tier format test (the `test_form_csrf_cross_tier.py` idiom — golden strings both sides); brittle only if `_moment` changes, which the pin catches |
| **G4** | A public lifecycle signal for `Live`/`Finished` chips and the `In play` facet — would need a new public semantic (`tournaments.status` is operator lifecycle, `models.py:110-113`; `tournament_date` is a nullable string, `:122-124`) | new backend semantics — **not minimal** | brief chip/facet vocabulary | **recommend decline** (see §9): chip set = `Entries open [— closes in Nd]` / `Entries closed`; facets = `Entries open` / `Upcoming` / `Past` (date-derived where parseable; unparseable/null dates match no date facet and carry no date chip) |
| **G5a** | Entrants rows regain the event dimension: `[{name, eventCode}]`, one row per person-per-event (re-adding what the 2026-08-10 dedup dropped, `entries_public.py:139-143`) | `api/entries_public.py:124-166`, `api/entries_json.py:150-159` | Entrants tab "grouped by event; counts per group" is binding; the flat name list cannot group | Entrants tab renders the flat name list + per-event counts from `events[].entryCount` (the layout survives, grouping doesn't) |
| **G5b** | Add `club` to entrant rows | same | brief says "name + club" | **recommend decline**: the acknowledgment consent copy promises publication of the *name* only (`entry.form.tsx:399-405`); publishing club outruns recorded consent. If approved, the acknowledgment copy must change with it — flag to owner |
| **G6** | Re-derive the page-weight budget at Phase C from the measured redesigned `/e/{slug}` (and add `/e/` to the measured set); gate stays blocking | `scripts/measure-page-weight.mjs:131` | a hero + tab page will exceed 2.5 KB; the 4 KB number was derived from the *document that exists* (R8-F precedent: budget follows measurement, `mjs:34-39`) | n/a — this is a ruling to book, not a field |

---

## 3. The route map

All paths under the `/e/` basename. Every loader reads `request` for URL only; every module
is auto-enrolled in the relay/mutable-state guards; `headers()` forwards `loaderHeaders`
wherever a CSRF mint occurs.

| Route | Module | Loader | Phase-gating inputs | States rendered |
|---|---|---|---|---|
| *index* (`/e/`) | `routes/discovery.tsx` (new) | G1 list (or decline-path fan-out); no mint (no forms posting secrets — the filter form is a GET) | per card: `entriesOpen`, `entriesCloseAt`, `tournamentDate` | results grid (upcoming-first: parseable future dates ascending, then undated, then past descending); filtered subsets; `EmptyState` (no tournaments / no matches, one action: clear filters) |
| `:slug` | `routes/tournament.tsx` (new) | `GET /e/api/page/{slug}`; `?tab` validated against `visibleTabs` | `events[]`, `entrants[]`, chip + CTA fns | hero (name, date(s), venue+locality, organizer, chip, ONE CTA: `Enter` link ⟷ `Entries closed` text); tab bar only when >1 tab visible; Overview card grid / Events rows / Entrants groups; 404 boundary (uniform copy, `entry.tsx:474-492` posture) |
| `:slug/enter` + `:slug/enter/signed-in` (same module, second `route()` with `id`) | `routes/enter.tsx` (new; carries forward `entry.tsx`'s loader/action/headers/meta mechanics verbatim) | same projection + `mintFormCsrf()` + `crypto.randomUUID()` + `parseEcho(query)`; **action**: body+query → `parseEcho` + `addPlayer` count (extends `entry.tsx:172-178`) | `openEvents.length` (0 → "No event is taking entries" + link back); `justSignedIn` from path | sectioned single page: Player(s) → events per player → acknowledgment → submit; sticky total bar; refusal notice from echo; signed-in outcome banner; `noindex` meta on the variant (`entry.tsx:247-249` idiom) |
| `:slug/receipt/:submissionId` | `receipt.tsx` (re-skin only) | unchanged (`receipt.tsx:95-133`) | — | success state: reference, amount recorded, payment instructions, links → tournament page + discovery (My-tournaments link: STOP-1) |
| `login` (+3 variants), `signup` | re-skin only — same loaders, same outcome-path pattern, same `revealable={false}`, same Turnstile notice | unchanged | — | small centered cards per brief §4 |
| `health`, `sitemap.xml`, `robots.txt` | unchanged | unchanged | — | — |
| `:slug/signed-in` (old variant) | **deleted with the old entry page** once G0 lands — its two producers (the entry page's own `next`, `entry.tsx:338`; the backend `?signedIn` echo, `entries_json.py:625`) both move to `/enter/signed-in` | — | — | — |
| `mock.discovery`, `mock.tournament`, `mock.enter` | Phase B only; frozen fixture module (`Object.freeze` — the mutable-binding guard exempts frozen literals, `sourceGuards.ts:59-63`); deleted at Phase C | none | — | the three key pages, both auth states where STOP-1 allows |

`safeNext` already admits the new paths (`/^\/e\/[A-Za-z0-9/_.~-]*$/`, `login.tsx:90`,
byte-identical to `_SAFE_NEXT` in `api/entrants.py`) — no change either side. Sitemap and
OG/meta carry over: slug URLs are unchanged; discovery gets its own static meta;
`tournament.tsx` inherits `entry.tsx`'s meta derivation (`entry.tsx:222-260`) minus the
`/signed-in` branch, which moves to `enter.tsx`.

---

## 4. The zero-JS resolution (per interactive element)

The tier's interaction budget is: **links, form GETs, form POSTs (with 303/307 round
trips), `<details>`, CSS**. Everything below lands on one of those or is called impossible.

| # | IA element | Mechanism | A11y contract | Verdict |
|---|---|---|---|---|
| Z1 | **Discovery filters** (status facets, date presets, custom range, text search) | One `<form method="get" action="/e/#results">` — radios for status facet, radios for date presets, two `<input type="date">` for custom, `<input type="search" name="q">`, an explicit `Apply` submit; the loader filters server-side and re-renders with the chosen controls `checked`; `Clear` is a plain `<a href="/e/">`. The `#results` fragment on the action lands the post-submit scroll at the results heading (HTML form submission preserves the action's fragment) | native form semantics; `<fieldset><legend>` per facet group; results heading is `id="results"` with `tabindex="-1"` | ✅ native |
| Z2 | **Filter rail → filter sheet at 390 px** | The rail cannot be a `<details>` — CSS cannot force a closed `<details>` open at desktop widths, so one server-rendered document can't be "sheet on mobile, open rail on desktop" that way. Use the native-checkbox disclosure: visually-hidden-but-focusable `<input type="checkbox" id="filters-toggle">` + `<label for="filters-toggle">Filters</label>` styled as a button, sheet shown via sibling selector under a `max-width` media query; at ≥768 px the media query shows the rail unconditionally and hides the toggle | the toggle is a real checkbox (keyboard-operable, announced "Filters, checkbox"); label text "Filters"; sheet content immediately follows the control in DOM order; visible focus ring on the label via `:focus-visible` + `:has()`-free sibling styling | ✅ with a stated ceiling: announced as a checkbox, not a disclosure button. The simpler alternative — an always-visible compact filter strip at 390 px, no toggle at all — is fully native and better-announced; offered in §9 |
| Z3 | **Header search** | the same GET form, `role="search"` landmark | native | ✅ |
| Z4 | **Header sign-in state** | impossible to vary (STOP-1 fact 3). Header always renders a "Sign in" link to `/e/login?next=…`; signed-in confirmation exists only on outcome routes (`/enter/signed-in`, `/login/signed-in`) | — | ⚠️ honest alternative shipped |
| Z5 | **"My tournaments" strip** | impossible on this tier (STOP-1) | — | ❌ owner ruling |
| Z6 | **Tabs (Overview \| Events \| Entrants)** | links, not widgets: `<nav aria-label="Tournament sections">` of `<a href="?tab=events">` etc.; the loader validates `?tab` against `visibleTabs` and renders exactly one panel server-side. Deliberately **not** ARIA `role="tablist"` (that pattern promises same-page panel switching; these are navigations) and not the radio-hack (unshareable state, broken back button, wrong semantics) | `aria-current="page"` on the active link; panel begins with a heading matching the tab name | ✅ native; each tab switch is a full (cheap, ~KB-scale) document load — stated, accepted |
| Z7 | **Status chip incl. countdown** | computed at SSR time by pure functions (§6) from server-shipped fields; "closes in Nd" is as-of-render (a reload refreshes it — this is a poster page, stated and accepted); `Live` dot, if G4 ever lands, uses the existing `sw-pulse` CSS keyframe wrapped in `@media (prefers-reduced-motion: no-preference)` | chip text is real text; the dot is `aria-hidden` decoration | ✅ render-time |
| Z8 | **Hero CTA** | `ctaState` fn: an `<a>` styled as the primary button when entries are open; plain status text (not a disabled button) when closed — exactly the brief's "non-interactive state text" | link vs text — nothing focusable pretends to be actionable | ✅ |
| Z9 | **Timeline card, current position marked** | SSR: pure fn orders the moments (entries open → close → withdrawal deadline → tournament date), marks "now" between them; per-event variance renders as a range line ("varies by event — see Events") rather than a false single moment; requires parseable moments (G3 or the pinned-format parse) | an `<ol>` — a timeline is a list; the position marker is text ("← you are here" pattern), not color alone | ✅ |
| Z10 | **Collapsible regulations** | `<details><summary>Regulations (v{n})</summary>…</details>`, collapsed only when the text is long (server decides by length threshold — a pure fn, so it's testable); short text renders open/plain | native disclosure semantics for free | ✅ native |
| Z11 | **Event rows "expanding or linking to the event's entrant list"** | link, not expansion: each `EventRow` links to `?tab=entrants#event-{code}` (with G5a) or to `?tab=entrants` (decline path). A per-row `<details>` duplicating entrant data into the Events panel doubles the payload for no capability | anchor targets carry headings | ✅ (choosing the link half of the brief's "expanding **or** linking") |
| Z12 | **Add another player** | a submit button inside the form: `<button name="addPlayer" value="1" formAction="/e/{slug}/enter" formNoValidate>Add another player</button>` posting to **the node route's own action** (the `entry.tsx:172-178` action pattern, extended): the action re-parses the posted body, renders `players.length + 1` blocks with the typing preserved. No backend call, no session needed, works signed-out. First render shows **one** block (killing SP-P6-1's permanent second blank card, `entry.form.tsx:89-92`); the parser drops empty blocks (`entry.form.tsx:18-20`) so an unused added block still costs nothing at submit | it's a real submit button; after the round trip the new block's heading is the document's newest content | ✅ round trip |
| Z13 | **"Update events and total"** | the existing 307 quote round trip (`entries_json.py:661-673`), retargeted by G0; button carries `formNoValidate` and the `?signedIn=1` transport (`entry.form.tsx:360-375`) | unchanged | ✅ — with the pre-existing R8-C cost restated: an anonymous press renders a raw JSON 401 (`entries_json.py:636-645`); the enter page's copy must keep saying sign in first |
| Z14 | **Sticky total bar** | `position: sticky; bottom: 0` on a bar that is the form's last section (mobile); at ≥1024 px a side rail via two-column grid + `position: sticky; top: var(--space-6)`. Contents: the **last-quoted** state from the echo (`totalBarState`, §6) — total, event count, `Submit entry`, and its own `Update total` quote button. **With no JS the bar cannot live-update as boxes tick**; it says what it is: "Quoted total" + "changed your selection? Update total". (A CSS-counter trick could live-count `:checked` boxes; rejected — content-property counters are unreliable for AT and it's cleverness where honesty is needed) | one landmark (`<section aria-label="Total and submit">`); the total is text, announced on re-render | ✅ with stated semantics — server-computed, round-trip-refreshed, exactly Seam B's posture |
| Z15 | **Auth-gated `/enter`** | node cannot gate a render on identity (STOP-1 fact 3). The shipped R8-E posture carries over verbatim: form renders unconditionally with the sign-in/sign-up handoff (`next=/e/{slug}/enter/signed-in`) beside it; the write is gated at `POST /e/api/submit/{slug}` (`entrant_or_back_to_form`); an anonymous submit navigates back with the `NOT_SIGNED_IN` notice (`lib/echo.ts:92-101`) | — | ⚠️ "auth-gated entry point" is reinterpreted as the shipped outcome pattern — flagged, since the brief's wording implies a server gate this tier cannot implement |
| Z16 | **Success state** | receipt re-skin; POST/redirect/GET already guarantees reload-safety (`receipt.tsx:1-8`) | — | ✅ (minus the My-tournaments link — STOP-1) |
| Z17 | **Password reveal** | stays deleted (`revealable={false}`) | — | ✅ opt-out preserved |
| Z18 | **Turnstile on signup** | pre-existing, unchanged: needs JS, CSP-scoped to `/e/signup` (nginx map), the page says so in fixed copy (`signup.tsx:142-146`) | notice precedes the form | pre-existing gap, not widened |

---

## 5. Component specs (contracts, not pixels)

All in `entrant/app/components/`, pure presentational (props → markup), no hooks, no
handlers, every module passing the (extended) guards. Token roles name `tokens.css`
variables; sizes/spacing are Phase B's craft within the token scale.

- **`DateBadge`** — `{date: string | null}`. Parses ISO `YYYY-MM-DD` only (fixed en month
  table — deterministic, no `Intl` dependence); renders the month/day block; null or
  unparseable → the "TBC" variant (same box, muted). Tokens: `--surface-raised`,
  `--text-muted`, `--radius-lg`. States: dated / TBC.
- **`StatusChip`** — `{state: ChipState}` (§6). Maps: `entriesOpen` →
  `--status-live`/`-bg` (+countdown text when present); `entriesClosed` →
  `--status-done`/`-bg`. (G4-gated `live`→ `--status-started` + `sw-pulse` dot,
  `finished`→ `--status-done` — spec'd but not shipped without G4.) Built on `StatusPill`'s
  token mapping with sentence-case public-register text (not the operator's uppercase
  micro-label). Dot is `aria-hidden`; `pulse` only under `prefers-reduced-motion:
  no-preference`. States: exactly the `ChipState` union — the component has no judgement of
  its own.
- **`TournamentCard`** — `{card: DiscoveryCard}` (G1 shape). Fixed anatomy per brief §1:
  `DateBadge` · name (the card's single link, wrapping the card via a stretched-link
  pattern so the whole card is one tap target with one tab stop) · venue locality
  (`venueName`) · "N events" · `StatusChip`. Tokens: `--surface-raised`, `--radius-lg`,
  `--rule-soft` border, `--shadow`-level hover. States: complete / no-date / no-venue
  (fields collapse, anatomy order fixed).
- **`FilterRail` / `FilterSheet`** — one component, two CSS presentations (Z2). Props:
  `{active: Filters}` (echoes checked state). Contains the entire GET form. States: rail
  (≥768 px, always visible) / sheet-closed / sheet-open (mobile, checkbox-disclosure);
  any-active → "Clear" link renders. Tokens: `--surface-sunken` sheet, `--rule-control`
  borders on controls.
- **`HeroHeader`** — `{tournament, org, venue, chip: ChipState, cta: CtaState}`. A real
  band: name (h1), date line, venue + locality, organizer, `StatusChip`, one CTA
  (link-button `brand` variant, or status text — never a disabled control). Tokens:
  `--surface-raised` band, type scale steps, `--space-6/7` rhythm. States: cta-enter /
  cta-closed × venue-present/absent × org-present/absent.
- **`TabBar` (public register)** — `{tabs: Tab[], active: Tab, hrefFor(tab)}`. `<nav>` of
  links, `aria-current="page"` (Z6). Renders `null` when `tabs.length < 2` (a one-tab bar
  is a placeholder in disguise — rule 4's spirit; tested). Tokens: `--rule-soft` baseline,
  `--blue-7` active underline/ink.
- **`TimelineCard`** — `{moments: TimelineMoment[], now}` where a pre-computed
  `timelineModel` (§6) supplies ordered `{label, at: string | null, state:
  past|current|future, variance?: 'per-event'}`. Vertical `<ol>`; the "now" marker is text
  + accent (`--blue-7`), never color alone. States: all-known / partially-known (missing
  moments omitted, never "TBD" placeholders — rule 4) / per-event variance line.
- **`FeeTable`** — `{feeSchedule: Record<string, number>, events: EventDTO[]}`. Renders the
  cumulative tier table ("1 event — 35.00", per-player framing) via `formatCents` only; when
  the schedule is empty, falls back to per-event `feeCents` rows; when neither exists, the
  card does not render (rule 4 — the Overview grid simply lacks it). No arithmetic beyond
  display (`money.ts:18-20` stays the only division).
- **`EventRow`** — `{event: EventDTO, entrantsHref?: string}`. Name, code, constraint
  labels (gender from `genderConstraint`, age from `ageBracketed`), "N entered" (+"of M"
  with G2), open/closed as text+tone, link per Z11. States: open / closed ×
  cap-present/absent × counts 0/N ("Nobody yet" is copy, not a placeholder tab).
- **`EntrantsList`** — with G5a: `{groups: {eventCode, discipline, rows: {name}[],
  count}[]}`, grouped sections with `id="event-{code}"` anchors; decline path: `{names:
  string[], events: EventDTO[]}` flat list + per-event count strip. Club column only under
  G5b. States: grouped / flat / empty (the tab itself is gated off before empty can render —
  `visibleTabs`).
- **`StickyTotalBar`** — `{state: TotalBarState, formCsrf-context: none}` (it lives inside
  the form; its buttons are plain submits per Z13/Z14). States: `unquoted` (copy: prices
  above are per event; "Update total" affordance) / `quoted{totalCents, eventCount}` /
  `refused{copy}` (fixed local copy from `refusalText`, `echo.ts:119-127`). Tokens:
  `--surface-raised`, top `--rule-soft` rule, `--shadow` lift; sticky per Z14.
- **`EmptyState` (public register)** — `{heading, body, action: {label, href}}` — exactly
  one action, friendly copy. Used by discovery (no matches → clear filters) and nothing
  else placeholder-shaped (rule 4 governs tabs; EmptyState is for *result sets*, and the
  distinction is: an empty result of a real query is information; an empty capability is a
  placeholder).

Component tests: SSR string renders (react-dom/server) asserting markup + token classes per
state — there is no client behaviour to test by construction (§7).

---

## 6. The phase-gating pure functions

All in `entrant/app/lib/phase.ts` (pure, no I/O, no Date.now — `now` is a parameter).
`parseMoment(s)` parses the pinned `"%Y-%m-%d %H:%M UTC"` format (or ISO under G3);
unparseable → `null`, and **no function re-derives `isOpen` from moments** — openness is
the server's (`entries_json.py:302`), moments feed display only.

```ts
type Tab = 'overview' | 'events' | 'entrants';
type ChipState =
  | { kind: 'entriesOpen'; closesInDays: number | null }
  | { kind: 'entriesClosed' };
type CtaState = { kind: 'enter'; href: string } | { kind: 'closed' };

entriesOpen(events: EntryEventDTO[]): boolean          // OR over server isOpen
chipState(events, now: Date): ChipState
ctaState(events, slug): CtaState                        // same predicate as chipState
visibleTabs(events, entrants): Tab[]
activeTab(requested: string | null, visible: Tab[]): Tab
statusFacet(card: DiscoveryCard, now): 'open' | 'upcoming' | 'past' | 'closed'
cardMatches(card, filters: Filters, now): boolean
visibleBlocks(echo: FormEcho, addPlayer: boolean): number
totalBarState(echo: FormEcho): TotalBarState
timelineModel(events, tournamentDate, now): TimelineMoment[]
```

**`chipState` / `ctaState` state table** (exhaustive — the tests transcribe it):

| any `isOpen` | open events with parseable `closesAt` | result |
|---|---|---|
| no (incl. `events = []`) | — | `entriesClosed` / `closed` |
| yes | none | `entriesOpen{closesInDays: null}` ("Entries open", no countdown) / `enter` |
| yes | ≥1, min future | `entriesOpen{closesInDays: ceil((min closesAt − now)/1d)}` / `enter` |
| yes | ≥1, min ≤ now (skew: server said open, clock says past) | `entriesOpen{closesInDays: 0}` ("closes today") — **never** flipped to closed client-side |

`min`, not `max`: the countdown must never overstate the time an entrant has (the nearest
deadline is the honest one; events closing later still show open rows on the page).

**`visibleTabs` state table:**

| `events.length` | `entrants.length` | tabs |
|---|---|---|
| 0 | 0 | `[overview]` (and `TabBar` renders null — <2 tabs) |
| >0 | 0 | `[overview, events]` |
| 0 | >0 | `[overview, entrants]` (unreachable in practice; the function is total) |
| >0 | >0 | `[overview, events, entrants]` |

Built as a declarative `[tab, predicate]` table so a future Draws/Schedule/Results tab is a
data addition (brief rule 4's "built so new tabs are data additions").

**`activeTab`:** requested ∈ visible → requested; anything else (null, unknown string,
data-hidden tab) → `overview`. Four test rows.

**`statusFacet` state table** (G4 declined — the recommended vocabulary):

| `entriesOpen` | `tournamentDate` | facet |
|---|---|---|
| true | any | `open` |
| false | parseable, ≥ today | `upcoming` |
| false | parseable, < today | `past` |
| false | null / unparseable | `closed` (listed; matches no date facet; card shows no date chip) |

**`cardMatches`:** conjunction of facet match (if a status filter is set), date-window match
(preset or custom range against parseable `tournamentDate`; unparseable → matches only when
no date filter is set), and case-folded substring of `q` against `name` and `venueName`.

**`visibleBlocks`:** `max(1, echo.players.length) + (addPlayer ? 1 : 0)`, clamped to 8
(display bound on a scriptless document; the parser accepts more, the clamp only bounds
what one render offers — stated in a comment).

**`totalBarState`:** `refusal` present → `refused{copy}`; else `totalCents` present →
`quoted{totalCents, eventCount: Σ echo.players[i].events.length}`; else `unquoted`.
(Counting ticked checkboxes from the echo is counting, not fee arithmetic —
`noClientFeeRules` is untouched; `formatCents` remains the only division.)

**`timelineModel`:** for each of opens/closes/withdrawal: if all events agree (or exactly
one event) → single moment; if they differ → the min–max range with `variance:
'per-event'`; absent everywhere → omitted (no placeholder). Tournament date appended when
parseable. `state` = past/current/future against `now`; `current` marks the gap "now" falls
in.

---

## 7. The test plan

**Pure-function tests** (vitest, table-driven — the §6 tables verbatim):
`phase.test.ts` (chip/cta/tabs/activeTab/facet/cardMatches/blocks/totalBar/timeline),
`parseMoment` golden strings pinned against `_moment`'s format both directions (the
`test_form_csrf_cross_tier.py` idiom: read the Python format from source or pin goldens on
both sides so a `_moment` change goes red here).

**SSR document tests** (the `entry.render.test.ts` idiom — real
`createRequestHandler` over the production-shaped build, stubbed `fetch` on frozen
fixtures): per route × state —
- discovery: empty / populated / each facet / query / preset / custom range; asserts
  checked-state echo, upcoming-first order, `EmptyState` single action;
- tournament: 4 `visibleTabs` rows × valid/invalid `?tab`; asserts exactly one panel,
  `aria-current`, TabBar absent when <2 tabs, CTA link vs text, **negative controls**: the
  strings "No draws", "coming soon", `disabled` on any tab-shaped element never appear in
  any state (the brief's rule-4 proof);
- enter: 1 block default / echo restores N blocks / addPlayer adds one / refusal copy /
  `/signed-in` variant banner + `noindex` / 0-open-events state; asserts `_csrf` +
  `idempotencyKey` hidden fields, form `action`s point only at FastAPI prefixes, no route
  under `/e/api/` or `/e/account/` (existing `routeConfig.test.ts` covers the latter
  automatically);
- receipt/login/signup re-skins: existing tests keep passing **unedited** — a re-skin that
  needs a test edit is a behaviour change and stops (CLAUDE.md refactor rule);
- every new document: zero `<script>` tags (signup's Turnstile pair excepted), stylesheet
  linked, `Cache-Control: no-store` present wherever a mint occurred.

**Structural guards** (extended, in the same commit that adds `app/components/`):
`sourceGuards.sourceNames` gains `'components'`; `routeFiles()`/relay/mutable-state guards
then cover the new surface automatically; `reservedSlugs.test.ts` and
`routeConfig.test.ts` need no edits (no new top-level static segments; nothing lands in
backend prefixes).

**Page weight:** `measure-page-weight.mjs` re-pointed at the redesigned fixture; G6 books
the budget re-derivation; propose measuring `/e/` as a second gated document.

**Browser (e2e, not PR-gated — the `10-entrant-r11-evidence.spec.ts` precedent):**
dual-width (390/1280+) screenshots of every page per brief rule 6; JS-disabled context
walking: filter GET round trip → card → tabs → enter → add player → quote round trip →
submit → receipt; keyboard-only pass over the filter sheet toggle, tabs, and details
disclosures; sticky bar visible at 390 px during form scroll.

**What needs a browser vs not:** anything asserting markup/state → SSR string tests;
anything asserting *scroll, stickiness, media queries, focus order, or native disclosure
behaviour* → the e2e spec. There are no client component behaviours to test because there
is no client code.

---

## 8. Phase B inputs

Three mock routes (`mock.discovery`, `mock.tournament`, `mock.enter` — dotted, so they can
never collide with a slug and need no backend reservation), one frozen fixture module with
realistic seeded data matching the brief's Phase D shape (≥4 tournaments across states:
near-deadline open, open, closed, one unlisted-by-slug), rendered through the real
components at both widths. Present with the register rationale and the §2 gate list.
Delete at Phase C. No wiring until sign-off (brief rule 3).

---

## 9. What I would cut (recommendations, owner's call)

1. **`Live` / `Finished` chips and the `In play` facet (G4 → decline).** No data exists
   (STOP-4); the honest date-derived substitutes cover discovery's real question ("can I
   enter this right now" — the brief's own words); the live-tournament family arrives with
   the Display migration that also brings the Draws/Schedule/Results tabs. Highest
   risk-per-value item in the brief.
2. **The signed-in hub / My tournaments / profile (STOP-1 → defer to E2).** Not buildable
   here without either the E2 API plus an identity-rendering ruling, or an architecture
   change. The §4 re-skins that *do* exist (login, signup, receipt) ship.
3. **The mobile filter *sheet* in favour of an always-visible compact filter strip at
   390 px.** The checkbox-disclosure works and is specced (Z2), but a three-control compact
   strip is fully native, one fewer trick, better announced, and R11-clean. Keep the sheet
   only if the pattern itself is wanted.
4. **Per-event expanding entrant lists inside the Events tab** — link to the Entrants tab
   anchor instead (Z11); duplicated data on one document is weight against the 4 KB-family
   budget for no capability.
5. **G5b (club on the public entrant list)** — outruns the recorded consent copy
   (`entry.form.tsx:399-405`); if wanted, it must ship with an acknowledgment-copy change,
   which makes it a bigger item than it looks.
6. **Custom date range** (keep presets) — mild: two `<input type="date">`s are cheap;
   cut only if the filter row is fighting for space at 390 px.

---

## 10. Carried-forward invariants (Phase C checklist)

Uniform 404 posture (`entry.tsx:84-95`); loader-mints-key/token + `headers()` forwarding
(`entry.tsx:97-138,180-198`); meta never reads `viewer` (`entry.tsx:200-221`); receipt
narrowing (`receipt.tsx:53-66`); forms post only to FastAPI prefixes, plain `<form>` never
RR7 `<Form>` (`entry.form.tsx:1-47`); `revealable={false}` on every password field;
`formatCents` the only money arithmetic; sitemap/robots untouched; sign-out form stays on
the page a signed-in entrant is on (moves from the old entry page to the enter page,
keeping the same-mint argument, `entry.tsx:404-461`); SP-P6-1 pages deleted only at proven
parity (brief rule 8), which means: every old URL either serves its superior replacement or
was an outcome variant whose producers all moved (G0 + `next` values).

---

## OWNER RULINGS — 2026-08-11

Recorded against the four STOPs raised in this document. These are binding and amend the brief
(`2026-08-11-sp-p6-2-public-ia-brief.md`) where they conflict with it.

### STOP-1 — signed-in states: **DEFERRED TO E2**

The signed-in discovery hub, the "My tournaments" strip and page, and the profile page are **out of
scope for SP-P6-2**. Discovery ships as a single signed-out state.

Rationale: the my-entries API is E2/Phase 7 work and does not exist; the pages do not exist; and the
node tier structurally cannot know who is reading (`apiFetch.server.ts` freezes an `accept`-only
outbound allowlist, `sourceGuards.ts` refuses any route module that reads a cookie or inbound
header). Rendering these from FastAPI was rejected because it reintroduces the two-rendering-
technology split SP-P6-1 exists to end; a CSP-nonce JS island was rejected because it breaks the
zero-JS posture and the blocking page-weight gate the whole tier is built on.

Brief §1 ("Signed-in: the entrant hub") and §4's "my tournaments" clause are struck for this phase.

### STOP-3 / G0 — the `/{slug}/enter` split: **APPROVED**

The two redirect Locations may be retargeted onto `/e/{slug}/enter`:
`_echo_redirect` (`api/entries_json.py`) and `entrant_or_back_to_form` (`api/entrants.py`).

This is a write-path change and therefore an explicit exception to the brief's read-only rule. It is
approved because there is no decline path that preserves the binding IA, and because both the 307
body-preserving quote redirect and its controls were built and proven in the preceding phase. The
existing security properties on those paths are unchanged and must stay: `refusalCode` plus numeric
`refusalSubjects` only (never free text, to close the GET-addressable echo-injection vector), and
the `next_target` allowlist.

### STOP-4 / G4 — Live / Finished / In-play: **CUT**

The status chip ships **two** states, both computed from data that exists:
`Entries open — closes in Nd` and `Entries closed`. The `Live`, `Finished` and `In play` chip states
and the In-play discovery facet are removed from the IA for this phase.

Rationale: `tournaments.status` is operator lifecycle, not a publishable signal, and
`tournament_date` is a nullable `String(32)` with no timezone. G4 (a public lifecycle signal) is
**declined** — deciding what "Live" means publicly is a product decision, not a field. Deriving the
state from `tournament_date` was rejected outright: it would be absent or wrong for any tournament
that has not filled it in, and wrong *confidently*, which is the defect class this program spent
2026-08-10 removing.

These states return when Display's projections migrate under the public site and a real signal
exists. The card still answers "can I enter this right now", which the brief names as its job.

### STOP-2 — R15: **UNRESOLVED, NON-BLOCKING**

"R15" appears nowhere in the tree; the ledger transcribes R10–R14 only. The brief cites it twice as a
boundary. Phase B proceeds without it; if R15 is a real ruling it must be transcribed into
`SP-PROGRAM-1.md` before Phase C, and any conflict it creates is a stop-and-report at that point.

### Gate proposals — status

| | Proposal | Ruling |
|---|---|---|
| G0 | Retarget the two redirects onto `/e/{slug}/enter` | **APPROVED** (see STOP-3) |
| G1 | Extend `GET /e/api/pages` items with `name, tournamentDate, venueName, eventCount, entriesOpen, entriesCloseAt` | **Open** — discovery cannot filter or render cards without it; the endpoint returns `{slug}` only today (verified in code and live) |
| G2 | Add `cap` to `EventDTO` (the model already has it) | **Open** |
| G3 | ISO moment fields (wire format today is the display string `"%Y-%m-%d %H:%M UTC"`) | **Open** |
| G4 | Public lifecycle signal for Live/Finished | **DECLINED** (see STOP-4) |
| G5a | Restore `eventCode` on entrant rows (the Entrants tab groups by event; the 2026-08-10 row-dedup dropped it) | **Open** |
| G5b | Club column on entrant rows | **Recommended decline** — outruns the recorded consent copy in `entry.form.tsx` |
| G6 | Re-derive the 4 KB page-weight budget at Phase C from the redesigned page, gate stays blocking (R8-F precedent) | **Open** |

G1, G2, G3 and G5a are read-only additions the brief already permits at the gate. They are not yet
ruled on individually; Phase B may mock against them, but Phase C must not wire a field the owner has
not approved.

---

## PHASE B SIGN-OFF — 2026-08-11

**Mockups APPROVED for Phase C**, with four refinements (owner ruling). Recorded here to satisfy the
brief's done-condition: *"Mockup sign-off recorded in the ledger before any wiring commit."*

Phase B shipped on `dev/prog1-p6-2-public-ia` as `68a738d` (phase-gating pure functions, 66 tests) and
`c584beb` (the three mockups). Measured through the production handler: discovery **2.4 KB**,
tournament **2.8 KB**, enter **3.3 KB** gzipped HTML, **0 script tags each**, all inside the 4 KB
blocking budget. The zero-JS mechanisms are the real ones, not stand-ins — the filter GET form
genuinely filters, `?tab=` renders one server-side panel with `aria-current`, and add-another-player
is a live form round trip that preserves both players' typing.

### The four refinements (all required in Phase C)

1. **"Closing soonest" secondary sort.** Upcoming-first currently ranks a closed-but-sooner
   tournament above one closing in 4 days. Correct per the spec, wrong for the page's stated job —
   the card that can be acted on must lead.
2. **Status chip in a fixed, right-aligned column** on desktop cards, rather than a bottom row.
3. **The nearest deadline restated inside the sticky total bar** — the one fact a hesitating entrant
   needs at the moment of submission.
4. **The 390px filter sheet becomes an always-visible compact strip.** The native checkbox-disclosure
   works, but "Filters, checkbox" is the weakest screen-reader announcement on an otherwise clean
   page, and the strip is one less trick.

### Gate proposals — final rulings

| | Proposal | Ruling |
|---|---|---|
| G0 | Retarget the two redirects onto `/e/{slug}/enter` | **APPROVED** (2026-08-11, STOP-3) |
| G1 | Discovery fields on `GET /e/api/pages` | **DECLINED** — the loader fans out one `GET /e/api/page/{slug}` per listed tournament. Correct, N+1. Revisit if a real deployment's listing grows past the point where that is cheap. |
| G2 | `cap` on `EventDTO` | **DECLINED** — Events rows read "7 entered" rather than "7 of 32 entered". |
| G3 | ISO moment fields | **APPROVED** — additive alongside the existing display strings, which `phase.test.ts` pins against the Python source. |
| G4 | Public lifecycle signal for Live/Finished | **DECLINED** (2026-08-11, STOP-4) |
| G5a | `eventCode` on entrant rows | **APPROVED** — restores the binding "Entrants grouped by event". **Must not reintroduce the row duplication** the 2026-08-10 dedup removed: one row per person, carrying their event codes. |
| G5b | Club column on entrant rows | **DECLINED** — outruns the recorded consent copy. |
| G6 | Re-derive the page-weight budget at Phase C | **Open** — the enter page at 3.3 KB is nearest the ceiling once real CSRF and idempotency fields land. The gate stays blocking either way. |
| G7 | A currency on the entry page, so fees can render as money | **Open** — raised 2026-08-11 from the Phase D demo walk (E5). See below. |

### G7 — a currency for the fee display (proposed 2026-08-11, owner's call)

**The finding.** Every fee on the public site renders as `45.00`, with no symbol and no code:
the Fees card, the per-event checkbox labels, the sticky total and the receipt's "Amount
recorded". `app/lib/money.ts` is the only place cents become a string and it deliberately
refuses to add one — *"there is no currency field in the schema, and inventing one in the
renderer would be a lie with a `£` on it"* — mirroring `_money` in
`backend/services/entry_fees.py`. That refusal is correct and **nothing in the E1–E5 round
changed it**: a hard-coded `$` is a claim the software cannot support, and the first
non-US-dollar tournament makes it a wrong claim on the page an entrant pays from.

**What would carry it.** One nullable column on `entry_pages`, beside the money that is
already there (`fee_schedule`, `payment_instructions` — `database/models.py`, the "money &
payment (R14)" block):

```
currency: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)   # ISO 4217
```

surfaced as `currency: Optional[str]` on **`EntryPagePublicDTO`** — the projection behind
`GET /e/api/page/{slug}`, which already carries `feeSchedule` and every `feeCents`. That is
the one read the public tier makes, so no new endpoint, no second round trip, and no page
that has fees but not the currency for them.

**Why read-only and minimal, at this gate.**

- *Read-only:* the public tier only renders it. Setting it is the operator app's entry-page
  configuration form, which already writes every other field in that block — no new write
  path, no new authorisation surface, nothing on the entrant side that can change it.
- *Minimal:* one nullable column, one DTO field, one argument to `formatCents`. **Null keeps
  today's behaviour exactly** — `45.00`, bare — so no existing tournament changes and no
  migration has to guess. `money.ts` stays the only division; the currency is a prefix on a
  string it already produces.
- *Not proposed:* per-event currencies, FX, locale-aware formatting, a symbol table. A code
  ("USD 45.00") or a symbol resolved from a three-entry map is a display decision the owner
  can make when the field exists; none of it is needed to stop the page being silent about
  what the number means.

**If declined**, the rendering stays honest and bare — which is the current, correct
behaviour, not a regression.
