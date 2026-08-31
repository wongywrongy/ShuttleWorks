# ADR 0018 — Public person universality and tournament-scoped identity

**Status:** Accepted
**Date:** 2026-08-31
**Scope:** public entrant tier (`/e/*`)

## Context

The public tier names people in schedules, draws, seeds, winners, match cards, and player pages.
Historically those surfaces received different name shapes and some used display text as a route key.
That made links inconsistent, made doubles parsing fragile, and risked exposing a name after a person
had opted out or been erased. Draw imports also contain names without an Entries identity.

## Decision

1. **One public reference.** Every person-bearing public projection carries a
   `PersonReferenceDTO`: an authoritative identity object (`id`, `name`) when available, an explicit
   `resolved`/`dead` resolution, and optional structural label text. The frontend has one `PersonRef`
   seam for rendering it. No other public component constructs, parses, or formats an identity string.
2. **Draw-only names are dead references (R-U1).** A name with no persisted tournament-person id may
   remain visible as draw structure, but it is plain text and cannot link to a person page. Bye, feeder,
   missing-id, hidden, and erased references use the same non-linking path.
3. **Pairs have no identity (R-U2).** A doubles pair is an event-scoped composition of two people. It
   is rendered as two `PersonRef` instances and there is no pair route or pair page.
4. **Courts publish from Operations only (R-U3).** A public schedule may show a court only after
   Operations materializes the assignment on the match row. Planned solver assignments are private
   planning data.
5. **Routes use persisted ids (R-U4).** A person page route uses the opaque persisted
   tournament-person identity id. Display strings are never normalized into a slug and are never the
   source of truth for a URL.

## Consequences

Public serializers have explicit allow-lists and exact key-set assertions for the identity, reference,
court, schedule, match, and draw fields they expose. Query-time publication and erasure filtering is
required; render-time hiding is not sufficient. Imported historical names remain useful without
pretending to be account-backed people. The person page is person-in-tournament, not a cross-tournament
registry; career history, rankings, and head-to-head remain out of scope.

The route remains useful without scripts. The public frontend is SSR-first with complete HTML and
native writes, while bounded same-origin modules progressively enhance search, entry progress, and
bracket path navigation.

## Verification

The decision is held by the entrant PersonRef, serializer privacy, route-key, schedule publication,
URL-state, and bracket geometry tests. Negative controls must fail when a dead reference becomes an
anchor, a name-derived route or formatter is added, a private serializer key is registered without
allow-list approval, or a planned court is projected publicly.
