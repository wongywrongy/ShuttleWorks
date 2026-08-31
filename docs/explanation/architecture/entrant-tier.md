# Entrant tier (the public site)

The public tournament site is a separate frontend workspace (`apps/entrant/`), served under `/e/`
on the public play origin. It covers discovery, tournament information, schedules, players, draws,
results, and the entry/account journey. It is not part of the operator SPA and it never changes
operator state directly.

## Delivery model

- **SSR-first, no framework hydration.** React Router renders complete documents. `root.tsx` emits no
  framework scripts, so the HTML remains useful on a slow connection or when scripts are unavailable.
- **Bounded progressive enhancement.** Same-origin route modules enhance only browser-dependent
  surfaces: entry progress, My Entries, receipts, regulations navigation, entrant filtering, and
  bracket path highlighting. Native forms remain the write path and the page-weight budgets are
  blocking: 4 KB for poster/discovery routes and 8 KB for the persistent entry journey.
- **One outbound SSR seam.** `apiGet` (`apps/entrant/app/lib/apiFetch.server.ts`) is GET-only,
  restricted to `/e/api/` and its frozen `accept` header allow-list. The node renderer never relays
  credentials, so server renders cannot identify the viewer.
- **Two origins and two principals.** The operator console is on `app.<domain>` behind Access; the
  public site is on `play.<domain>` without Access. Entrant accounts and `sw_play_session` are
  structurally separate from operator users and `sw_session`.

Writes go browser → nginx → FastAPI through relative native form posts or same-origin enhancement
requests. The nginx cookie allow-list carries only entrant session/CSRF cookies. `CSP form-action
'self'` and host-only cookies enforce the boundary.

## Public keys and privacy

Tournament pages use the globally unique `entry_pages.slug`; raw tournament UUIDs never appear in a
public URL. A closed page and an unknown slug have the same 404 response. Person pages use the
persisted tournament-person identity id (`entry_players.id`), never a display name or derived slug.
The id is opaque and only meaningful inside that tournament.

The public identity contract is:

```ts
type PublicPersonIdentity = { id: string | null; name: string };
type PersonReference = {
  identity: PublicPersonIdentity | null;
  resolution: 'resolved' | 'dead';
  label: string | null;
};
```

The frontend's `PersonRef` is the only name renderer. A resolved reference links to the person's
tournament page; a winner uses the same link with weight; a bye, feeder placeholder, imported
draw-only name, hidden identity, erased row, or missing id is a muted non-link. Doubles are two
person references separated by an element that belongs to neither person. There is no pair page.

## Publication gates

Three independent, reversible, operator-controlled flags determine what enters the public
projection:

| Flag | Public projection |
|---|---|
| `entrants_published` | confirmed, non-opted-out people and discoverable person pages |
| `draws_published` | draw structure, published roster references, and seeds |
| `results_published` | scores, standings, winners, match outcomes, and resolved advancement |

Gating occurs in the query/projection layer, not in the renderer. Contact data, account data,
unconfirmed submissions, and hidden/erased identities are never fetched into public DTOs. A draw-only
name without a persisted public person identity remains a dead reference under R-U1. The same public
directory merges confirmed entrant people with named published draw-roster people; only the former
have a person page.

## Projection API

All public reads are strict allow-list projections with exact key-set tests. Results arrive already
gated; the display tier does not infer publication state or create alerts.

| Route | Purpose | Gate |
|---|---|---|
| `GET /e/api/pages` | season discovery with lifecycle status, counts, and live pick | open page |
| `GET /e/api/page/{slug}` | tournament identity, phase-aware overview, events, policy, documents, and public entrants | page open; entrants list by `entrants_published` |
| `GET /e/api/page/{slug}/matches` | schedule/live matches, day/event/court/state facets, timezone, revision and updated time | schedule publication |
| `GET /e/api/page/{slug}/players` | searchable tournament directory and public person references | entrants or draws publication |
| `GET /e/api/page/{slug}/players/{personId}` | one person's events, partners, draw paths, published matches, and current court state | entrants publication; results independently gated |
| `GET /e/api/page/{slug}/draws` | draw cards with discipline, format, size, rounds, coverage, and champions/remaining work | draws publication |
| `GET /e/api/page/{slug}/draws/{drawKey}` | segments, rounds, nodes, person references, published scores, courts, and standings | draws publication; results independently gated |
| `GET /e/api/page/{slug}/seeds` | ordered seed lines per event | draws publication |
| `GET /e/api/page/{slug}/winners` | champion, runner-up, semifinalists, final score, or published final still to decide | results publication |
| `GET /e/api/me/entries` | signed-in entrant's private entries and next actions | entrant session; private/no-store |

Schedule reads are day-first. The UI preserves day, event, player, court, state, and organization
filters in the URL while switching between By time and By court. Courts appear only from Operations'
materialized assignment (R-U3), never from planned solver assignments. The live band is absent unless
the selected day is today and at least one published match is live.

## Draw and match consumption

The draw index uses a whole-card link and a stable format glyph. The bracket uses exactly two-line
nodes, fixed-width tabular score columns, CSS brace connectors, and a 6px base gap. Its Bracket / Round
/ List control preserves the selected person filter. Round and List are the linear accessible
equivalents; each node includes visually hidden context describing the published opponent/path.

Person pages use the operator match anatomy: event/round context, two competitor rows, aligned
per-game scores, winner mark or a left rule for a live match (never both), then quiet date/court/
duration metadata. The page is person-in-tournament only; career history, rankings, head-to-head,
and cross-tournament records belong to a later registry program.

## Entrant journey

The entry flow is one context-preserving journey: Eligibility → Account → Participant → Events →
Partner (when needed) → Review → Payment (when needed) → Submitted → Receipt. Account creation,
verification, password reset, and partner invitations return to the tournament and preserve saved
entry state. My Entries groups Draft, Email unverified, Partner pending, Payment required, Submitted,
Changes requested, Confirmed, Withdrawn, and Completed states by their next action.

## Source of truth

The backend projection is implemented in `apps/api/src/entries/entries_site.py`,
`entries_public.py`, and `entries_json.py`; frontend mirrors live in
`apps/entrant/app/lib/`. The binding visual artifact is
[`public-universality-usability-v2.html`](https://github.com/wongywrongy/ShuttleWorks/blob/main/public-universality-usability-v2.html), and the dated
implementation/audit record is [SP-P9 findings](/audits/2026-08-SP-P9-findings).
