# Entrant tier (the public site)

The public tournament site — discovery, tournament pages, the entry flow,
and (since SP-P7) entrant surfaces: My Entries, player directories, player
pages, draws, seeds, and winners. It is a **separate frontend workspace**
(`apps/entrant/`), not part of the operator SPA.

## Shape

- **React Router 7, server-rendered.** A node process renders documents;
  each tab/page switch is a full document load. There is no Zustand, no
  client data store; state lives in URLs and loaders.
- **`apiGet` is the only outbound seam** (`apps/entrant/app/lib/apiFetch.server.ts`):
  GET only, `/e/api/` paths only, a frozen `accept`-only header allowlist.
  Node never relays credentials (ruling R8-D), so an SSR document can never
  know who is signed in — `ViewerDTO.signedIn` is always `false` on the
  server render, pinned by `tests/backend/test_entrant_ssr_contract.py`.
- **Writes go browser → nginx → FastAPI directly** (form posts and, since
  SP-P7, cookie-carrying browser fetches). nginx routes `/e/api/` and
  `/e/account/` to the backend with a cookie allowlist that carries the
  entrant session cookie; `/e/` goes to node.
- **Its own hostname, and therefore its own browser origin** (SP-HOST-1).
  `play.<domain>` serves this tier from port 8081 of the `frontend` container
  with no Cloudflare Access policy on it; the operator console and `/api/` are
  `app.<domain>` on port 8080, behind Access. Two hostnames rather than one
  split by path, because **origin** is what scopes cookies, `localStorage`,
  IndexedDB and service-worker registration, and the `Path=` attribute on a
  cookie is not enforced against same-origin script. Under the old shared
  origin an operator's `sw_session` was reachable from code running here.
  Nothing in `infra/nginx/` names a hostname — the tunnel routes hostname to
  port, so the domain stays configuration (`APP_HOSTNAME` / `PLAY_HOSTNAME`).
- **No browser-side API calls at all**, which is what makes the split free of
  CORS. `root.tsx` renders no `<Scripts/>`; the one client script is a
  DOM-only filter. Every write is a native `<form method="post">` to a
  relative path on this same host — a navigation, not a CORS request — so the
  operator API's allow-list stays closed to this origin and nothing breaks.
  Two things enforce that and both demand same-origin: CSP `form-action
  'self'`, and a host-only `sw_play_session`.
- **Two principals, two seams.** Entrant accounts (`entrant_accounts` +
  `entrant_sessions`) are structurally separate from operator users
(ruling D-A3). `tests/backend/test_cross_principal_sessions.py` sweeps every
  route with each cookie and holds the reachable sets to their allowlists.

## Public keys and the uniform 404

The **slug** (`entry_pages.slug`, globally unique) is the only public key;
raw tournament UUIDs never appear in public URLs. An unknown slug and a
closed page answer byte-identically (`apps/api/src/entries/entries_public.py::_resolve`), so
existence is not enumerable. Person pages are keyed by **person id**
(`entry_players.id` as an opaque `personKey`) — never by name; two
entrants sharing a name is routine at a club.

## The publication model (SP-P7 §4)

Three TD-controlled flags on `entry_pages`, all defaulting **off**,
independent, reversible, flipped from the operator console's Sharing tab
(`PATCH /tournaments/{id}/entry-page/publication`):

| Flag | Gates |
|---|---|
| `entrants_published` | confirmed people in the Players directory, and player-page discoverability |
| `draws_published` | draw-roster people in the Players directory, draws, and seeded entries |
| `results_published` | result data everywhere: scores, standings, winners, win–loss records, result badges — and **resolved advancement** in draw trees |

Rules the tests pin:

- Gating happens **at the query**, never in the renderer: unpublishing
  actually stops the data flowing (`test_entries_page_api.py`,
  `test_entries_site_api.py` off-state tests).
- Gated and empty answer the same 200; the page projection's
  `publication` block is how the tier tells them apart. No error shape
  distinguishes an unpublished state.
- **My Entries is not gated** — an entrant always sees their own
  submissions. The one exception is per-event result badges, which follow
  `results_published`.
- The public **Players** directory is one merged projection: confirmed
  entrants retain their profile links, while published draw-roster people
  without an Entries identity appear as plain names. Pending and waitlisted
  submissions remain visible to their own account alone via
  `/e/api/me/entries`.
- With draws published but results not, a draw renders **structure and
  schedule without results** — including advancement: the engine
  overwrites feeder slots when a result resolves them, so the projection
  reconstructs the pre-result placeholder ("Winner of SF 1") from the
  resulted dependency (`api/entries_site._derivation`).

## The projection API

All public reads live under `/e/api/` and are strict, field-by-field
allow-list projections (key-set-exact tests). Times derived from slot
grids are **venue-local naive strings** — no zone is stamped because none
was recorded.

| Route | Serves | Gate |
|---|---|---|
| `GET /e/api/page/{slug}` | the whole tournament page: tournament, org, venue, page content + `regulations{Version,UpdatedAt}`, policy, `publication`, events, entrants (`personKey`, name, club, eventCodes), viewer | entrants list by `entrants_published` |
| `GET /e/api/page/{slug}/players` | the unified alphabetical player directory: confirmed entrants plus named published draw-roster people; only Entries-backed rows carry `personKey` profile identity | `entrants_published` or `draws_published` |
| `GET /e/api/page/{slug}/draws` | draw cards: key, code, discipline, kind, size, consolation | `draws_published` (explicit `published: false` envelope) |
| `GET /e/api/page/{slug}/draws/{key}` | full draw: teams (names, club, seed), segments → rounds (labels) → nodes (sides, result, time, court), RR standings + W/L history pills | `draws_published` (404); results by `results_published` |
| `GET /e/api/page/{slug}/seeds` | per-event ordered seed lists | `draws_published` |
| `GET /e/api/page/{slug}/winners` | winner / runner-up / semifinalists per event, `decided` flag | `results_published` |
| `GET /e/api/page/{slug}/players/{personKey}` | header (name, club), events, matches (both engines), win–loss record | `entrants_published` (404); results by `results_published` |
| `GET /e/api/me/entries` | entrant-session-authed: one card per tournament — status lifecycle (`awaiting`/`entered`/`played`/`withdrawn`), summed quoted totals, per-event lines + gated result badges | session; `Cache-Control: private, no-store` |

Draw structure is projected from the bracket module's own serialized
session (`api/brackets._serialize_session`, through its short-TTL
`response_cache`) — the same read the operator surface and Display
consume, so the public tier cannot drift from the real draw. Meet
matches come from the state blob + `match_states`, the Display
precedent. Standings are `apps/api/src/bracket/standings.py` (BWF chain),
embedded by the same serializer.

## Privacy discipline

Public rows carry: name, club, seed, event participation, published
results — nothing else. Contact data is structurally absent (never
fetched-then-hidden). The consent copy on the entry form names exactly
what is published ("name and club"); a field joins a public DTO only
after the copy that consents to it does, and every public DTO has a
key-set-exact test that fails on any addition.
