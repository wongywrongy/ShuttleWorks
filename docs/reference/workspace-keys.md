# Workspace keys — the four kinds, and the mapping

One workspace is addressable four different ways. That is deliberate, and this page is the
layer that says so — the answer to **F-DM-25** ([debt log](/reference/debt-log)), ruled by the
domain-model design as *"a declared mapping table, not a re-key. Each of the four is
deliberate."* Nothing here proposes convergence; ADR 0014 fences the `tournament` spelling
and this page does not touch it.

The single rule the whole table hangs off: **a raw workspace UUID is never a public
address.** It is stated twice in the code, once per public tier —
`apps/api/src/entries/entries_json.py:30` and `apps/api/src/display/display.py:10`.

## The four kinds

| Kind | Value | Defined | Resolved | Audience |
|---|---|---|---|---|
| **Workspace UUID** | `tournaments.id` | `apps/api/src/db/models.py:88,91` (`Uuid` PK, `default=uuid.uuid4`) | the `tournament_id` path param + `require_tournament_access(role)`, which resolves it **by name** | operator only — storage + the whole `/tournaments/{tournament_id}/…` wire |
| **Entry-page slug** | `entry_pages.slug` | `apps/api/src/db/models.py:1708,1730` (`String(100)`, one row per workspace) | `entries/entries_public.py:102` `_resolve(repo, slug)` → `(EntryPage, Tournament)`; uniform 404 when missing **or closed** | public entrant tier, `play.<domain>/e/{slug}` — meant to be shared |
| **Display capability token** | `display_tokens.token` | `apps/api/src/db/models.py:1023,1039` (stored RAW; minted `secrets.token_urlsafe(24)`, `display/display.py:56`) | `display/display.py:97` `_resolve(repo, token)`; every route GET, no mutation | public spectator display, `/display/{token}/*` — capability, not discovery |
| **No id at all** | — | `apps/console/src/api/dto.ts:27` (`TournamentConfig`), `apps/console/src/store/tournamentStore.ts:22` (`TournamentState`) | n/a | the console's own **data blob** carries no workspace id |

### The fourth row is narrower than it looks

The console is not keyless. It holds the UUID — just not in the data store. The route param
(`apps/console/src/app/App.tsx`) is mirrored into `uiStore.activeTournamentId`
(`apps/console/src/store/uiStore.ts:144-146`, set by `pages/TournamentPage.tsx:69` and
`hooks/useTournamentState.ts:381`). It is **not persisted** — a refresh re-derives it from
the URL. So the accurate statement is: *the console's workspace blob is scoped by a key it
does not itself contain*, held one layer up in UI state instead.

## How they map

All three non-UUID kinds are **owned rows carrying a `tournament_id` FK**, so the mapping is
always one hop and always in the same direction:

```
entry_pages.slug   ─┐
display_tokens.token┼─→ tournaments.id ─→ (console) uiStore.activeTournamentId
                    │                       └─ scopes → tournamentStore's blob
(nothing)          ─┘
```

There is no reverse public lookup by design: neither public tier accepts a UUID, and neither
public resolver leaks which of "not ours", "does not exist" and "closed" it hit.

## Consequences worth knowing before you change one

- **The slug is nullable on the my-entries card.** `MyEntryCardDTO.slug: Optional[str] = None`
  (`apps/api/src/entries/entries_me.py:94`, filled at `:397` as `page.slug if page is not
  None else None`) — an entry whose page row is gone still renders, without a link.
- **Renaming a slug orphans every shared public entry URL.** Nothing in the product forbids
  it today.
- **Revoking display access is rotation or row deletion**, not expiry — the token is stored
  raw precisely so the Sharing tab can re-display the link.
- **The entrant routes carry no `tournament_id`**, so `tests/backend/test_tenant_isolation.py`
  (which derives its sweep from `{tournament_id}` in the OpenAPI path) does not cover them.
  `_resolve`'s uniform 404 is their tenancy answer instead — by design, not by oversight.
