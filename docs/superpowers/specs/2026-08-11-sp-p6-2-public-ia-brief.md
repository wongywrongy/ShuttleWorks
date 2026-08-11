# SP-P6-2 — Public site redesign: the IA it was missing

> **Status:** binding brief, logged 2026-08-11. Authored by the owner.
> **Design document:** to be produced from this brief (Phase A + design), then Phase B mockups gated on owner sign-off.
> **Branch (implementation):** `dev/prog1-p6-2-public-ia` — not yet created; SP-P6-1 work is still settling on `dev/prog1-p6-entrant-app`.
>
> This file is the **binding** input. The IA below is not the implementing agent's to redesign.

**Type:** Implementation (frontend-dominant). **Deliverable:** the `play.*` app rebuilt around a researched, binding information architecture — discovery with filters, tabbed tournament pages, a dedicated entry flow — at the operator app's polish bar. **Fixes the SP-P6-1 outcome:** the shipped pages used design tokens but no page system; they read as documents. This prompt binds the structure and delegates only the pixels.

---

## ABSOLUTE RULES

1. SP-PROGRAM-1 invariants and rulings (R10–R15) apply. A2 still holds: local only, no exposure, no dashboard/DNS changes.
2. **The IA in this prompt is binding.** Page inventory, tab model, card anatomy, and flow separation are specified below and are not the agent's to redesign. Visual execution — spacing, type scale application, color application within the token system, micro-interactions — is the agent's craft, exercised within the design system. If the IA conflicts with something in the tree, STOP.
3. **Mockup gate [USER SIGN-OFF]:** no data wiring until static mockups of the three key pages are approved (Phase B). This is the process correction — SP-P6-1 went straight to implementation and produced structure-less pages.
4. **Phase-gated tabs; no placeholders, ever.** A tab renders only when its data exists and is published. No "No draws yet," no disabled tabs, no coming-soon of any species. Draws/Schedule/Results tabs are *out of scope entirely* until Display's projections migrate under the public site (later program work) — the tab bar ships with Overview | Events | Entrants only, built so new tabs are data additions.
5. **Consumer register, same tokens** (spec §9.1): the operator app is dense and technical; this surface is welcoming and scannable. Reference points for register (structure, not branding): BWF's calendar for discovery, Tournament Software's tournament hub for the tabbed page, start.gg for status-chip clarity. Do not imitate their brands; extract their information architecture.
6. R11 dual-width bar on every page (desktop-comfortable, fully functional at 390px; filter rail becomes a filter sheet on mobile). Screenshots both widths, every page.
7. TDD for behavior (filters, phase-gating logic, chip states, sticky total math display); existing E1-2/P6 API contracts are consumed, not modified — if a page needs a field the API lacks, STOP and report rather than extending the backend silently (small read-only additions may be proposed at the gate).
8. Branch `dev/prog1-p6-2-public-ia`; commit per task; ledger at session end; the SP-P6-1 pages this replaces are deleted when parity is proven.

---

## THE BINDING IA

### 1. Discovery (`/`)

- **Signed-out:** platform front door. Header (wordmark, search, sign-in). A filter rail (desktop) / filter sheet behind a Filters button (mobile): **status** (Entries open · Upcoming · In play · Finished), **date presets** (next 7 days · next month · next 3 months · custom), **text search** (name/venue). Results as **tournament cards**, upcoming-first.
- **Signed-in:** the entrant hub — "My tournaments" strip first (their upcoming entries with submission state), then the same discovery below. One page, two states.
- **Tournament card anatomy (fixed):** date badge (month/day block) · tournament name · venue locality · events count · **status chip**. The chip is semantic and computed: `Entries open — closes in Nd` (positive/green range), `Entries closed` (neutral), `Live` (accent, animated dot), `Finished` (muted). The card answers "can I enter this right now" without a click.

### 2. Tournament page (`/{slug}`)

- **Hero header:** name, date(s), venue + locality, organizer, status chip, and **one** phase-dependent primary CTA: `Enter` (entries open) / `Entries closed` (non-interactive state text, not a dead button) / later phases arrive with their tabs. Header is a real hero band, not a stacked `<h1><p><p>`.
- **Tab bar:** **Overview | Events | Entrants** (phase-gated per rule 4; Entrants only when the entrant list is non-empty and published per I6).
- **Overview tab:** the R14 card layout, actually built this time — intro text; **Timeline card** (entries open → close → withdrawal deadline → tournament date, rendered as a vertical timeline with the current position marked); **Fees card** (tier table, per-player framing); **Payment card** (instructions); **Regulations card** (text + version, collapsible if long); **Venue card** (name, address). Two-column card grid desktop, single column mobile.
- **Events tab:** per-event rows — name, code, gender/age constraint labels, entered count (and cap when set), open/closed state — each expanding or linking to the event's entrant list.
- **Entrants tab:** grouped by event; name + club; counts per group.

### 3. Entry flow (`/{slug}/enter`) — its own page, off the hub scroll

- Auth-gated entry point: signed-out users hitting it get the sign-in/sign-up handoff with `next` return.
- **Sectioned single page** (not a wizard): Player(s) → Events per player (gender-filtered, override per R12) → Acknowledgment → Submit. Add-another-player is an explicit action, not a permanently rendered second blank card (the SP-P6-1 layout doubled the entire form inline).
- **Sticky total bar** (bottom on mobile, side rail or sticky footer on desktop): running server-computed total, event count, submit button. The quote round-trip from E1-2 stays; the presentation makes it feel live.
- Success state: what was entered, states, fee total, payment instructions, link to My tournaments.

### 4. Existing pages (signup / login / profile / my tournaments)

Re-skinned into the same system: auth pages as small centered cards; My tournaments adopts the card + status-chip language. No functional change; R15 boundaries unchanged.

### Component inventory (build once, in the public app's component layer)

`DateBadge` · `StatusChip` (all chip states, semantic tokens) · `TournamentCard` · `FilterRail`/`FilterSheet` · `HeroHeader` · `TabBar` (public register) · `TimelineCard` · `FeeTable` · `EventRow` · `EntrantsList` · `StickyTotalBar` · `EmptyState` (public register: friendly, one action). Each gets a component test; chips and phase-gating get exhaustive state tests.

---

## PHASES

### Phase A — Audit (short)

Read the ledger, the shipped SP-P6-1 pages, the E1-2/P6 API surface (what discovery/slug/quote/submit endpoints return — cite fields), the design system's available primitives, and R15's boundaries. List any IA-required data the API doesn't expose (candidates: per-event caps, withdrawal deadline in the slug payload, "closes in" timestamps) as gate proposals, each read-only and minimal.

### Phase B — Static mockups **[STOP — USER SIGN-OFF]**

Build the three key pages as static, realistically-seeded mockups in the app (route-accessible, fake data module): **discovery (both auth states) · tournament page (Overview + Entrants) · entry flow (two players, three events, sticky total)**. Screenshots at 390px and 1280px+. Present with a one-paragraph register rationale and any Phase A API proposals. **No wiring until approved.** Rework here is cheap; that is the point.

### Phase C — Components + wiring

Approved mockups decompose into the component inventory (tested), then wire to real endpoints. Phase-gating logic implemented and tested as pure functions (phase/publication state → visible tabs, chip state, CTA state). Delete the replaced SP-P6-1 pages once every route has its superior replacement; nothing regresses (desk, tests, sitemap, OG tags carry over).

### Phase D — Demo (leave running)

Seed: ≥4 listed tournaments across states (entries open with near deadline · entries open · closed · one unlisted), multi-event + multi-player submissions. Walk: discovery filtering by status and date → card → tournament page tabs → enter (two players, running total) → success → my tournaments. Screenshots of every page, both widths. Verify the unlisted tournament renders by direct slug with the full page system. URLs reported; servers stay up.

## NON-GOALS

Draws/Schedule/Results tabs and any Display migration · backend changes beyond gate-approved read-only additions · E2 features (verification, withdraw, profile editing) · performance/stats surfaces (R15) · exposure/DNS/keys · marketing site · operator-app changes beyond deletions of replaced templates.

## DONE CONDITIONS

- [ ] Mockup sign-off recorded in the ledger **before** any wiring commit
- [ ] All IA elements exist as specified (tab model, card anatomy, entry flow separation, sticky total) — deviations = failures, not interpretations
- [ ] Phase-gating pure functions fully state-tested; no placeholder/disabled/coming-soon tab renders under any state (test proves it)
- [ ] Every page screenshotted both widths; SP-P6-1 pages deleted with zero regressions; gates green repo-wide, counts up
- [ ] Component inventory complete with tests; chips cover all states
- [ ] Ledger updated; A2 assertions repeated (no exposure)
