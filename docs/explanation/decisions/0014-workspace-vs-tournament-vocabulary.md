# ADR 0014 — Workspace is the product word; tournament is the storage word

**Status:** Accepted (2026-08-19, `dev/reorg-1`, SP-REORG-1 Phase 6).

## Context

The product model calls the thing you operate a **workspace**. ADR 0002 named it,
the Hub lists them, the sidebar navigates one, Settings configures one, and every
surface a director sees says workspace.

The persistence and wire layers call the same thing a **tournament**:

| Layer | What it says |
| --- | --- |
| Tables | `tournaments`, `tournament_backups`, `tournament_members` |
| Routes | 70 paths under `/tournaments/...` |
| Path param | `tournament_id`, required by name — `require_tournament_access` depends on it |
| Console store | `tournamentStore.ts`, `TournamentDTO`, `useTournamentState` |

Both words are load-bearing and neither is wrong. The workspace vocabulary
arrived with the control-plane redesign; the tournament vocabulary predates it
and is baked into the schema, the public API surface and the generated DTOs.

The cost today is not confusion for a user — no user sees `tournament_id`. The
cost is that a reader of the code cannot tell whether "tournament" in a given
place is **the old word for a workspace** or **a genuine tournament concept**,
and every new identifier is a coin flip. That ambiguity has been quietly
spreading for months, which is the shape of a problem that gets more expensive
exactly as long as nobody names it.

SP-REORG-1 is a layout program: it does not change wire contracts, schemas or
behaviour. So the choice here is between fencing the inconsistency and leaving it
ambient.

## Decision

**Fence it. Do not rename anything.**

1. **`workspace` is the product-model term.** Every NEW identifier that means
   "the thing a director operates" uses it: UI copy, component and module names,
   product docs, console state that is not the DTO, and API routes added from
   here on where no existing prefix constrains them.

2. **`tournament` is a fenced legacy stratum** in exactly three places, and it
   stays:
   - the database tables and their columns,
   - the `/tournaments/...` route prefix and the `tournament_id` path parameter,
   - the console's `tournamentStore` and the generated DTO types that mirror
     the wire.

3. **The translation is one line, and it is written down here:**

   > **workspace** ⟷ a `tournaments` row ⟷ `/tournaments/{tournament_id}` ⟷ `tournamentStore`

   They are the same thing at four altitudes. Nothing else is a workspace, and
   nothing in that row is a tournament in the sporting sense.

4. **`tournament` in the SPORTING sense is not fenced and is not legacy.** A
   bracket draw, a meet, an event — those are real domain nouns and keep their
   names. The fence is only around the workspace-record usage.

## Why not rename

The rename is a wire-contract change, not a refactor:

- `require_tournament_access` resolves the path parameter **by name**, and
  `tests/backend/test_tenant_isolation.py` derives every workspace route from
  OpenAPI and fails CI on a missing seam. Renaming the parameter touches the
  tenancy guard on 70 routes at once.
- The routes are public API. The entrant tier, the display capability links and
  any self-hosted client are all consumers.
- `dto.generated.ts` is generated FROM the schema, so the console's types change
  with it, and `dto.ts` is a hand-reconciled view of that.
- Three tables and their foreign keys mean a migration on the one thing the
  product promises to keep safe on a director's laptop.

That is a program, not a phase, and it touches the entrant tier. **If it is
wanted, it is its own program with its own gates.** This ADR exists so the
boundary is documented instead of ambient in the meantime.

## Consequences

- A reader who meets `tournament` can now answer "is this legacy or domain?"
  from the layer it appears in, without asking.
- New code has one rule, so the ambiguity stops growing even though it is not
  shrinking.
- The inconsistency remains visible and undefended in the schema and the wire
  contract. That is the deliberate cost: this ADR buys clarity about the
  boundary, not the removal of it.
- Should the rename ever happen, this page is the specification of what has to
  move and what must not.

## Related

- ADR 0002 — workspace as control plane (where the product word came from)
- `docs/reference/glossary.md` — both words, with this translation
- SP-REORG-1 Phase 6 — the program that fenced it
