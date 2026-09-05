# Entrant tier UI/UX audit (2026-09)

Status: Findings, awaiting owner rulings.

## Scope

The public entrant tier (`apps/entrant/app/**`, `apps/entrant/public/assets/*.js`) on the
`feat/sp-pub-audit-1` branch, commit `6995491c`. Two independent auditors covered
non-overlapping ground:

- Auditor A: design-system conformance, checked against source and computed styles
  (`tailwind-preset.js`, `tokens.css`, `packages/design-system/DESIGN.md`, `MOTION.md`,
  ADR 0027/0028, `Button.tsx`). Findings carry `A-` ids.
- Auditor B: Nielsen's ten usability heuristics plus WCAG 2.2 Level AA, walked across
  four entrant journeys (discover a tournament, enter, manage an entry, follow a draw)
  on the live demo. Findings carry `B-` ids.

A third source, a rulebook compiled from the same repo, records seven places where the
design-system's own sources disagree, and fourteen professional heuristics that have no
written rule in this repo at all. Both are addressed under "Rulings the owner must make"
below.

## Method

Auditor A read `apps/entrant/app` and `public/assets/*.js` against the rulebook's smell
patterns (raw Tailwind palette classes, off-ladder `text-*`/`rounded-*`/arbitrary
brackets, hand-rolled button strings, heading depth) and confirmed each hit against the
design-system sources and the screenshots in `.playwright-mcp/sp-pub-audit-1/`.

Auditor B drove the live demo at `http://100.68.168.126:8091/e/` with Playwright and
Chromium at two viewports (1280x900 and 390x844), each with and without JavaScript, and
again at the CSS-pixel equivalent of 200% and 400% zoom (1280@400% = 320 CSS px) to check
WCAG 1.4.10 Reflow. The demo build serves 30 tournaments, zero of them taking entries,
which closes off the entry wizard, the receipt, withdraw, and player pages as end-to-end
journeys; those are listed under "Not testable on the demo data" rather than reported as
defects.

This document merges both reports under one ranking, applies the orchestrator's
corrections below, and does not re-litigate them.

## Corrections applied

1. **A-13** reworded: the button tier is mixed, not absent. The shared `Button` is used
   in 14 entrant files (`EventRow`, `HeroHeader`, `MessagePage`, `SeasonControls`,
   `StickyTotalBar`, and the `enter`, `health`, `login`, `myEntries`, `partner`,
   `resetPassword`, `schedule`, `signup`, `verify` routes). The hand-rolled strings
   (`BUTTON_SECONDARY` in `apps/entrant/app/lib/ui.ts`, the enter wizard's Continue
   buttons, `entry-wizard.js`, `receipt.js`, `turnstile.js`, regulations, and the draw
   Find button) lack the hard-shadow press construction, and the page-scoped scripts
   cannot import `Button`. Fix is a CSS-only twin string pinned by
   `apps/entrant/tests/uiTwins.test.ts`. Severity stays Major.
2. **B-8** (sign-up does not sign in) is reclassified as a design constraint, not a
   defect: `apps/api/src/identity/entrants_routes.py` states "Non-enumeration is the
   invariant on this file," and signup answers a uniform body on both the created and
   already-registered branches so it cannot mint a session without telling the two
   branches apart. Severity drops to Minor; the fix is copy, not behavior ("For your
   security we do not sign you in automatically" on the created-account page), and the
   without-JS sign-up stop is separately deliberate (Turnstile cannot run without
   scripting).
3. **B-10** is split. The missing player-profile entry point is a demo-seed gap (imported
   rosters have dead-resolution identities that are never linked, by rule): moved to
   "Not testable on the demo data." The 256 event-code chips rendered as 19x16 px tab
   stops in the Players tab remains a standalone Minor ergonomics finding.
4. **B-16** (bracket node truncation) is the one allowlisted exception to the repo's
   no-truncation rule: `apps/entrant/tests/noTruncation.test.ts` allowlists
   `apps/entrant/app/components/MatchCard.tsx`'s bracket-node variant, and the geometry is
   pinned by an e2e fixture. Kept as Minor; the full name is already in the node's
   `aria-label`, so the open question is only whether to keep the allowlist.
5. **B-15** (heading skips h1 to h3 on discovery and the Players tab) is a measured
   finding and wins over Auditor A's "no skipped levels" line. Merged with **A-20**
   (`SectionCard`'s `titled` variant renders an `h2` where the `eyebrow` variant renders
   an `h3` for the same nesting depth) into one Major heading-outline finding.
6. **B-9** ("Taking entries · 0" says "Check spelling") stays a Major finding: the current
   copy is a documented choice in `apps/entrant/app/routes/discovery.tsx` (a segment is
   itself a selection, so the empty state cannot distinguish "no filter" from "filter too
   narrow" without checking). Fix is copy branching on `anyFilterActive`.
7. **A-1/A-3** (page title off the type ladder; three arbitrary hero sizes) are merged
   into one Major finding. Fix is one named display step added to the design-system
   `fontSize` scale, used in `PAGE_TITLE`, `HeroHeader`, `discovery.tsx`, and the
   `PlayShell` wordmark.
8. **A-4/A-5/A-6** (three eyebrow constructions; `EYEBROW` hand-copied ten times) are
   merged into one Major finding, together with rulebook contradiction 1 (eyebrow
   tracking 0.06em vs 0.08em) as the ruling the owner needs to resolve it.
9. The three defects already logged in `docs/reference/debt-log.md` (public player
   detail answering 422/500 instead of the uniform 404; the tournament overview's
   "Players entered" figure summing the wrong count; the entry page's unconditional
   "Sign out") are cross-referenced below, not re-reported as new findings. **A-23**
   folds into the first of these.
10. Everything in Auditor B's "Things I checked that pass" and "What works well" is kept
    verbatim in "What passes and what to keep": it carries as much weight as the
    findings.

## Headline

| Severity | Count |
|---|---:|
| Blocker | 3 |
| Major | 11 |
| Minor | 14 |
| Nit | 4 |

The three Blockers, one sentence each:

- **B-1**: a mistyped password on sign-up (step 2 of 6 on the only revenue path) lands
  the entrant on a raw, unstyled JSON error page with every typed field gone and no way
  back but the browser's Back button.
- **B-2**: the bracket's "Find a player or pair" form silently does nothing in Bracket
  view (a real name and a nonsense name return byte-identical markup), so a spectator
  cannot tell whether the search failed or the player is simply absent.
- **B-3**: at 320 CSS px or via keyboard alone, the bracket's scroll container is never
  constrained by its parent, so the whole document scrolls sideways instead of the
  bracket, and the 31 bracket nodes are not focusable at all, stranding the semifinal and
  final off-screen for a zoomed or keyboard-only reader.

## Findings

| Id | Area | Route/where | What happens (verbatim evidence) | Rule or criterion | Severity | Proposed fix |
|---|---|---|---|---|---|---|
| B-1 | Sign-up error handling | `POST /e/account/signup`, weak password | Full document is `<html><head><meta name="color-scheme"...><meta charset="utf-8"></head><body><pre>{"detail":{"code":"AUTH_WEAK_PASSWORD","message":"That password is on the list of most commonly breached passwords"}}</pre></body></html>`; no title, no lang, no main, no form, every typed field destroyed | H9 recognise/recover from errors; WCAG 3.3.1, 2.4.2, 3.1.1, 1.3.1 | Blocker | Content-negotiate on `Accept: text/html` as `apps/api/src/identity/entrants_routes.py`'s `/login` route already does: 303 to `/e/signup/{slug}/failed?code=AUTH_WEAK_PASSWORD`, render the fixed sentence beside the password field in `apps/entrant/app/routes/signup.tsx` with `aria-invalid`/`aria-describedby`, echo the non-secret fields as `defaultValue` |
| B-2 | Bracket search | `/e/{slug}/draws/{key}`, Bracket view | `?player=Kidambi` and `?player=zzzznotaplayer` return byte-identical bracket markup; only a "Clear player filter" link implies anything was filtered; List view correctly renders "No matches found" for the same query | H1 visibility of system status | Blocker | Filter or mark the bracket nodes server-side as List view already does, in `apps/entrant/app/routes/draw.tsx`; always render a result line in a `role="status"` above the bracket |
| B-3 | Bracket reflow and keyboard | `/e/2026-taipei-open-t029/draws/MS` | At 320 CSS px `documentElement.scrollWidth = 1456`, `clientWidth = 320`; the culprit `DIV.overflow-x-auto` has its own `clientWidth = 1440`, uncontained by its parent; tabbing the page gives 9 stops total and never reaches the 31 `article[data-testid="public-bracket-node"]` elements | H4, H7; WCAG 1.4.10, 2.1.1 | Blocker | In `apps/entrant/app/routes/draw.tsx`, add `max-w-full min-w-0` to the scroll wrapper and its grid parent so `overflow-x-auto` clips at the viewport; give the wrapper `tabindex="0"`, `role="group"`, `aria-label="Draw bracket, scrollable"` |
| A-1/A-3 | Type ladder | `apps/entrant/app/lib/ui.ts:48` (`PAGE_TITLE`), `apps/entrant/app/components/HeroHeader.tsx:48`, `apps/entrant/app/routes/discovery.tsx:130`, `apps/entrant/app/components/PlayShell.tsx:71` | `PAGE_TITLE` uses `text-3xl` (off the 8-step ladder, falls through to Tailwind's default scale); `discovery.tsx` uses `text-[1.75rem]`, `HeroHeader.tsx` uses `text-[1.875rem]`, `PlayShell.tsx` uses `text-[15px]`, three arbitrary bracket values for what is conceptually one hero-title role | Type ladder is `3xs,2xs,xs,2sm,sm,base,lg,2xl` only (`tailwind-preset.js:34-42`) | Major | Add one named display step to the design-system `fontSize` scale and use it in `PAGE_TITLE`, `HeroHeader`, `discovery.tsx`, and the `PlayShell` wordmark instead of three ad hoc values |
| A-4/A-5/A-6 | Eyebrow vocabulary | `EYEBROW` in `apps/entrant/app/lib/ui.ts:52`; `apps/entrant/app/components/DateBadge.tsx:29`, `apps/entrant/app/routes/tournament.tsx:293`, `apps/entrant/app/components/SeasonCalendar.tsx:45`, `apps/entrant/app/components/NowStrip.tsx:42`; `apps/entrant/app/routes/enter.tsx:478`, `apps/entrant/app/routes/regulations.tsx:189`; `apps/entrant/app/routes/draw.tsx` (x4), `tournament.tsx`, `schedule.tsx`, `player.tsx` (x2), `apps/entrant/app/components/EntrantsList.tsx:76` | `EYEBROW` is `text-xs font-bold uppercase tracking-[0.06em]`; a second construction, `text-2xs font-semibold uppercase tracking-[0.08em]`, appears at 4 badge call sites; a third, `text-xs font-semibold uppercase tracking-[0.08em]`, appears at 2 more; and 10 further call sites hand-copy `EYEBROW`'s own string instead of importing it | Eyebrow should be one 10px/600/uppercase construction; rulebook contradiction 1 (0.06em vs 0.08em, `tokens.css` vs entrant `EYEBROW`) | Major | Resolve rulebook contradiction 1 first, then fold all three constructions into one named constant and import it at every `.tsx` call site (the page-scoped `public/assets/*.js` files are the documented exception, since they cannot import the module) |
| A-9 | Button radius by size | `apps/entrant/app/lib/ui.ts:81` (`BUTTON_SECONDARY`), `apps/entrant/app/routes/regulations.tsx:174,181`, `apps/entrant/app/routes/partner.tsx:219`, `apps/entrant/public/assets/turnstile.js:40`, `apps/entrant/public/assets/entry-wizard.js:137` | All are `h-10`/`min-h-10` (40px, the default `Button` size) but use `rounded-md` (9px) instead of `rounded` (8px); `entry-wizard.js:136`'s primary button at the same height uses the correct `rounded` one line above its `rounded-md` secondary sibling | ADR 0027 d6 / `Button.tsx:59-65`: default size (40px) maps to `rounded`, `rounded-md` is reserved for `lg` (44px); rulebook contradiction 3 (radius by role vs. radius by size) | Major | Change `BUTTON_SECONDARY` and its four duplicated copies to `rounded`, or migrate these onto the real `Button variant="outline"` so the mapping cannot drift again |
| A-13 | Button construction | `apps/entrant/app/lib/ui.ts:81` (`BUTTON_SECONDARY`), `apps/entrant/app/routes/enter.tsx:601,606,612`, `apps/entrant/app/routes/regulations.tsx:174,181`, `apps/entrant/app/routes/draw.tsx:542` ("Find"), `apps/entrant/app/routes/partner.tsx`, `apps/entrant/public/assets/receipt.js:115-116,271,279`, `apps/entrant/public/assets/entry-wizard.js:136-137`, `apps/entrant/public/assets/turnstile.js:40` | None of these hand-rolled strings carry `active:translate-y-[3px] active:shadow-none`; the primary "Continue" buttons use a plain soft `shadow` instead of the hard-offset press construction | `Button.tsx:33` `HARD = 'shadow active:translate-y-[3px] active:shadow-none'` is the one button construction (ADR 0027 d6); note the tier is mixed, not absent, the shared `Button` is used in 14 other entrant files | Major | Give the hand-rolled strings the same `shadow` + hard-shadow press treatment (pure CSS, no JS needed) and pin the twin with `apps/entrant/tests/uiTwins.test.ts`, extending it to `BUTTON_SECONDARY`, `receipt.js`, `turnstile.js`, regulations, and the draw Find button |
| B-15/A-20 | Heading outline | `/e/` (discovery), `/e/{slug}?tab=players`, `apps/entrant/app/components/SectionCard.tsx:39` vs. `apps/entrant/app/routes/tournament.tsx:172` | Discovery: `h1 Tournaments` then `h3 August 2026`, `h3 Completed`, zero `h2`; Players tab: `h1` then 22 `h3` letter headings; schedule has two `h1`s ("Taipei Open (2026)" and "Schedule / Live"); separately, `SectionCard`'s `titled` variant renders its card title as `h2`, the same level as the sr-only panel `h2` it nests under, while the `eyebrow` variant correctly uses `h3` for the same nesting depth | WCAG 1.3.1 Info and Relationships | Major | Demote the month/letter group headings to `h2`; make "Schedule / Live" an `h2` under the tournament `h1`; make `SectionCard`'s `titled` variant use `h3` to match the `eyebrow` variant |
| B-4 | Discovery search | `/e/` search field | `<input name="q">` carries `outline-none` with no `focus-visible:` replacement; focused and unfocused computed styles are byte-identical; the submit button is `<button type="submit" class="sr-only">Search</button>`, so there is no visible submit control | H1, H2; WCAG 2.4.7 Focus Visible | Major | Put the ring on the wrapper (`focus-within:outline focus-within:outline-2 focus-within:outline-accent`); replace the `sr-only` submit with a visible icon button carrying `aria-label="Search"` |
| B-5 | Schedule event filter | `/e/{slug}/schedule`, event `<select>` | Option labels render raw internal identifiers: `mens_doubles_final`, `mens_singles_final`, `womens_doubles_final`, `womens_singles_final`, `mixed_doubles_final`; the `value` attributes are already clean (`MD`, `MS`, `WD`, `WS`, `XD`) | H2 speak the users' language | Major | Render the same human label the draw pages already produce ("Women's Singles") as the option text; keep the code as the value |
| B-6 | Date formatting | `/e/{slug}/schedule`, entry page, regulations, tournament overview | Header reads "Schedule updated 2026-08-31T19:31:02.925172+00:00 · Asia/Taipei"; match cards read "2026-07-29 · 11:00 · Court 5"; entry page reads "Tournament date 2026-08-04" and regulations "Tournament date 2026-07-28" while overview reads "Tuesday 4 August 2026" for the same tournament | H2, H4 consistency | Major | Route every user-facing date through `apps/entrant/app/lib/format.ts`'s `formatDateLong` / a relative "Updated 5 minutes ago"; delete the duplicated "last updated" line |
| B-7 | Withdraw confirmation | `apps/entrant/public/assets/my-entries.js:344-395` | Pressing "Withdraw" runs `wrap.textContent = ''`, destroying the focused button, then appends the confirm/cancel prompt and later the outcome into a plain `<span>` with no `role="status"` and no `aria-live`; focus falls to `<body>` | H1, H10; WCAG 4.1.3, 2.4.3 | Major | Give `wrap` `role="status"` at construction; call `.focus()` on the newly rendered confirm button |
| B-9 | Discovery empty state | `/e/?view=open` (the "Taking entries · 0" segment) | Selecting the one segment that shows open tournaments renders "No tournaments match / Check spelling, change the date range, or clear filters" with an empty search box and no date filter applied; clearing filters changes nothing | H1, H2 | Major | Branch the empty state in `apps/entrant/app/routes/discovery.tsx` on `anyFilterActive`: with none set, say "No tournament is taking entries right now. Completed events are under Completed." |
| B-11 | Reflow at 320px | `/e/{slug}` (overview), `/e/{slug}/regulations` | Overview overflows by +11px because the tournament sections nav does not wrap; regulations overflows by +93px because the body paragraph lays out 397px wide inside a 320px viewport | H1, H6; WCAG 1.4.10 Reflow | Major | Add `flex-wrap` to the sections nav; add `min-w-0` and `max-w-full` to the regulations prose column |
| A-2 | Type ladder | `apps/entrant/app/routes/regulations.tsx:251`, `apps/entrant/public/assets/receipt.js:149` | `text-xl`, not in the 8-step ladder, at two isolated spots | Type ladder is `3xs,2xs,xs,2sm,sm,base,lg,2xl` only | Minor | Replace with `text-lg` |
| A-11 | Input radius | `apps/entrant/app/routes/partner.tsx:219` select | `h-10 rounded-md` instead of `FIELD_INPUT`'s `rounded-sm` (also flagged under A-9) | Known/logged debt: some inputs use `rounded` instead of `FIELD_INPUT`'s `rounded-sm` | Minor | Route this control through `FIELD_INPUT`/`SELECT_CONTROL` like the rest of the tier's selects |
| A-12 | Off-ladder heights | `apps/entrant/app/components/MatchCard.tsx:48,98` | `h-[22px]` (compact match row), `h-[44px]` (bracket node) | Spacing/radius ladder is `0/2/4/8/12/16/24/32/48/64/96` | Minor | If these pixel-fit values are load-bearing for bracket density, name them as tokens so a future ladder change cannot silently break the bracket grid |
| A-21 | Motion tokens | `apps/entrant/app/app.css:98-105` `.sw-sweep`, used by `NowStrip.tsx` | `animation: sw-sweep 6s linear infinite`; `6s` is not one of `--motion-*`/`--dur-*`, nor one of the two named ambient-loop periods (`--pulse-dur` 1.6s, `--nudge-dur` 2s) | MOTION.md §3: locked named tokens, no raw `ms`/`s` values; rulebook contradiction 7 | Minor | Add a `--sweep-dur: 6s` token alongside `--pulse-dur`/`--nudge-dur`, or record this as a third named ambient-continuous exception in `MOTION.md` |
| A-24 | 44px hit area | `apps/entrant/app/routes/draw.tsx:542` ("Find" button, 36px), `apps/entrant/app/components/PlayShell.tsx:86` (sign-in/My-entries link, 32px) | Neither carries the DS `Button`'s `HIT` pseudo-element trick (`before:absolute before:-inset-2`) that compact DS buttons use to reach 44x44 invisibly | Accessibility rule: 44px hit area claim on compact buttons (rulebook flags this as unverified) | Minor | Add the same `::before` inset trick (pure CSS) to both controls, or record them as accepted exceptions |
| B-8 | Sign-up to sign-in | `/e/{slug}/enter/created` | Creating an account sets only `sw_play_csrf`; `sw_play_session` arrives only from `/e/account/login`, so the entrant retypes the email and password they set 5 seconds earlier | H1, H5, H7; design constraint per correction 2 (non-enumeration invariant) | Minor | Keep the "your account is ready" banner but say why in copy: "For your security we do not sign you in automatically." Behavior stays as-is |
| B-10 | Players tab ergonomics | `/e/{slug}?tab=players` | 256 event-code chips (`MD`, `MS`, `WD`, `WS`) render at 19x16 CSS px, 15x16 for `XD`, at 390px width, and are all tab stops a keyboard user must traverse | H2, H8 minimalist design | Minor | Collapse the event chips into one non-interactive text run per person ("MD · XD") in `apps/entrant/app/routes/tournament.tsx`'s Players tab |
| B-12 | Form resubmission | `entries_json.py:964` `_echo_redirect`, "Update events and total" | The quote round trip is a 307 (correctly preserves the POST for privacy, per its own comment), but reloading the result re-posts and triggers the browser's "Confirm form resubmission" prompt; no in-flight feedback on submit | H1, H3; WCAG 4.1.3 | Minor | Keep the 307; have `entry-wizard.js` disable the submit button and swap its label to "Updating total…" on submit, restoring on `pageshow` |
| B-13 | Entry wizard nav | `/e/{slug}/enter` when entries are closed | Three of the six "Entry progress" steps link to anchors that do not exist in the served HTML (`entry-participant`, `entry-events`, `entry-review` all occur 0 times); clicking them does nothing; no step carries `aria-current` | H1, H4 | Minor | Render unreachable steps as `<span aria-disabled="true">`; put `aria-current="step"` on the active one |
| B-14 | Tab titles | tournament tabs (Overview, `?tab=draws`, `?tab=players`) | All three share one `<title>` ("Taipei Open (2026) · Results"); an unrecognised `?tab=` value silently renders Overview instead of 404ing | H2, H4; WCAG 2.4.2 | Minor | Compose the title from the active tab; 404 an unknown `tab` value |
| B-16 | Bracket node truncation | bracket nodes, `apps/entrant/app/components/MatchCard.tsx` (bracket-node variant) | "Panitchaphon Teeraratsa…" is visually clipped by `SPAN.block min-w-0 truncate` inside a fixed `w-64 h-[44px]` article; the full name survives in `aria-label` | H8; the repo's own no-truncation rule, allowlisted here per `apps/entrant/tests/noTruncation.test.ts` and a pinned geometry e2e | Minor | Owner allowlisted this exception already; the open question is whether to keep the allowlist or let the slot wrap to two lines |
| B-17 | Touch targets | `/e/` at 390x844 | 61 targets under 24x24 CSS px in `main` (tournament title links 142x18, "Results →" links 67x20, date "Reset" 37x20); nearest-centre spacing measured at minimum 40-50px, so all pass WCAG 2.5.8 via the spacing exception | H1; general ergonomics, not an AA failure | Minor | Make the whole card row the link (`::after` overlay) so the target is the card, not the 18px text |
| B-18 | Withdraw affordance | `apps/entrant/public/assets/my-entries.js:346-380` | Withdraw controls are 12px underlined text styled as links for the two most destructive actions on the site; no undo after a plain (non-erasing) withdrawal | H3, H10 | Minor | Style the confirm step's "Withdraw" as a real destructive button; keep a "Re-enter this tournament" link on the withdrawn row |
| B-19 | Schedule pagination | `/e/{slug}/schedule` day chips | Day chip shows an unlabelled count of 131 next to a result heading that says "155 matches"; pagination reads "Page 1 of 7" with only a "Next →" link, and the Previous slot renders as an empty nested span | H2 | Minor | Label the chip count ("131 matches"), reconcile it with the total, and add numbered page links |
| A-8 | Font weight | `apps/entrant/app/components/MatchCard.tsx:51` | `font-[650]` (arbitrary bracket) on the winner's name | `type-display`'s comment ties 650 to that utility specifically | Nit | Name the value if it is meant as a general "winner emphasis" outside `type-display` |
| B-20 | Filter labels | `/e/{slug}/schedule` filters, `/e/` date presets | The `event`/`court`/`state` selects carry `aria-label` and no visible `<label>`; visible text is only the current option; date-preset radios rely on being wrapped in a `<label>` with no `label[for]`/`aria-label` | H2; WCAG 3.3.2 (borderline) | Nit | Add a persistent visible label above each select, matching the entry form's pattern |
| B-21 | Live region overuse | `/e/{slug}/enter` | The static account paragraph is wrapped in `role="status" aria-live="polite"` on every render, including the plain page-load state | H1; WCAG 4.1.3 | Nit | Keep `role="status"` only on the `/enter/created` and `/enter/signed-in` variants, where the text is an outcome |
| B-22 | Accessible name grammar | Draws tab cards | Accessible names drop apostrophes: "Mens Doubles Final draw", "Womens Singles Final draw", while the draw pages themselves say "Men's Singles" | H2 | Nit | Derive the accessible name from the same discipline label the draw page uses |

## Rulings the owner must make

1. **Seven source contradictions**, each with the finding it blocks:
   1. Eyebrow tracking 0.08em (`tokens.css:231`, `.eyebrow`, `EYEBROW_CLASS`) vs 0.06em
      (StatusPill, entrant `EYEBROW` in `ui.ts:52`). Blocks A-4/A-5/A-6.
   2. `DESIGN.md` 1.8.c says mono is never for eyebrows; `DESIGN.md`'s section 5 table
      says Eyebrow = font-mono. Code follows 1.8.c. No open entrant finding depends on
      this; noted for completeness.
   3. Radius by role (`DESIGN.md` 1.3, ADR 0027 d1) vs Button radius by size (ADR 0027
      d6, `Button.tsx`) vs `tokens.css:141-146` comments. Blocks A-9.
   4. Card radius: ADR 0020 "square" vs ADR 0027 "8px"; `docs/reference/design-system.md`
      top table still cites ADR 0020. No open finding (A-10 conforms to the documented
      tier exception either way), but the stale table should be corrected.
   5. `docs/reference/design-system.md:15` still lists `BRAND.md` as authoritative, though
      `BRAND.md:1-3` and `DESIGN.md:6-27` supersede it. No open entrant finding; a
      documentation debt.
   6. StatusChip shape: ADR 0020 d2 says `rounded-full`; ADR 0027/0028 implement
      rectangular; ADR 0020's text is not struck. A-14 conforms to the rectangular
      implementation; the ADR text should be reconciled either way.
   7. `--motion-slow`/`--dur-slow` "not for new surfaces" vs. the recorded
      `sw-dock-transition` exception. Blocks A-21 (`sw-sweep`'s 6s duration has no
      equivalent named exception).
2. **Fourteen unsourced professional heuristics.** None has a written rule in this repo
   today; adopting one as a standing rule means future audits can cite it directly.

   | # | Heuristic | Recommend / defer |
   |---:|---|---|
   | 1 | In-flight feedback for native form POSTs | Recommend |
   | 2 | Form error identification/suggestion/prevention (WCAG 3.3.1/3.3.3/3.3.4) and data preservation on rejection | Recommend |
   | 3 | Link vs. button affordance, and buttons that do nothing without JS | Recommend |
   | 4 | Loading/error (5xx, timeout) states distinct from empty | Recommend |
   | 5 | General touch target 24/44px beyond `Button` | Recommend |
   | 6 | Wayfinding/information scent after "You are here" removal | Defer |
   | 7 | Skip link + landmarks (WCAG 2.4.1) | Recommend |
   | 8 | Complex table header association (WCAG 1.3.1) | Defer |
   | 9 | Focus management on validation failure / tab change (WCAG 2.4.3) | Recommend |
   | 10 | Autocomplete attributes (WCAG 1.3.5) | Defer |
   | 11 | Colour-blind verification method | Defer |
   | 12 | Accessible names on icon-only buttons | Recommend |
   | 13 | Confirm/undo for destructive actions | Recommend |
   | 14 | Print/offline receipt | Defer |

3. **Bracket truncation allowlist (B-16).** Keep `MatchCard.tsx`'s bracket-node variant
   allowlisted in `apps/entrant/tests/noTruncation.test.ts`, or let the slot wrap to two
   lines and remove the exception.
4. **Page-title type step (A-1/A-3).** Whether the design-system `fontSize` scale gets a
   new named display step for hero titles, or the tier drops to the existing `2xl` and
   relies on `type-display`'s weight/width axis instead.

## What passes and what to keep

From Auditor A's conformance pass:

- Colour: no raw Tailwind palette classes; no `bg-accent` used as a second competing
  primary on any page; `StatusChip` used exactly once, exceptional-state only.
- Motion: no forbidden easing curves, no un-tokened `duration-*`, no
  `animate-*`/`transition-all`/`shadow-glow`; the one animation (`sw-sweep`) is correctly
  covered by the global reduced-motion rule.
- Components: `StatusChip` shape/no-dot rule; `SegmentedNav` as the sole nav treatment
  (via `TabBar`); `Select` (Radix) absent from entrant; `MatchCard` one anatomy with
  sr-only winner marking; `TextField` visible labels on checked forms; exactly one `h1`
  per HTML route, no skipped heading levels at the top of the tree.
- Content: no emoji; no em dash in rendered copy (comments only); no invented currency
  symbol; consistent middle-dot fact separator; explicit "don't assert what we don't
  know" design rulings honored in `OverviewPanel`/`NowStrip`.
- Public tier: SSR-complete native forms with no client hydration; self-hosted fonts
  under `/e/assets/`.
- Accessibility: focus-visible ring is a global rule, not a per-element one, and it does
  reach every interactive element.
- Spacing/radius: `rounded-lg` on entrant cards is the documented, deliberate
  tier-specific exception (ADR 0020/0028), not drift.

From Auditor B's live walk, things checked that pass:

- **PII in URLs.** The "Update events and total" round trip is a 307 that keeps the body
  out of history and access logs (`entries_json.py:964`, reasoning documented). `parseEcho`
  maps a server refusal code to fixed local copy and never renders text off the URL.
  Correct on both counts.
- **WCAG 2.5.8 Target Size (Minimum).** Every sub-24px target measured clears the 24px
  spacing exception (minimum nearest-centre distance 40px). Reported as ergonomics
  (B-17), not as an AA failure.
- **Reduced motion.** The NOW strip's `.sw-sweep` is `6s linear infinite`, but the
  shipped stylesheet carries a global `prefers-reduced-motion: reduce` rule that
  collapses animation duration and iteration count. No 2.2.2/2.3.3 concern.
- **Console and CSP.** Ten routes loaded at 390px with a `securitypolicyviolation`
  listener installed: zero console errors, zero warnings, zero CSP violations, zero
  failed requests. CSP is tightened per route; `frame-ancestors 'none'`,
  `form-action 'self'`, `object-src 'none'`, plus `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a real `Permissions-Policy`.
- **The 404 contract.** Unknown or closed slugs, unknown draws, and unknown receipts all
  answer 404 with the shell, a heading, and a "Browse tournaments" button, not a stack
  trace.
- **`lang="en"`, one `<main>`, a working skip link.** Every route carries
  `<html lang="en">`, exactly one `<main>`, `<header>`, `<footer>`, and a first-tab-stop
  skip link that becomes visible on focus with a 2px blue outline.
- **Stale demo copy, not a product defect.** "Tournament in progress" on a tournament
  that finished in July, and "Upcoming tournament" on one the calendar labels Completed,
  come from `simulator/tournament_sim/seed.py:2071`.

From Auditor B's task-completion walk, what works well:

- **The no-JS baseline is real, not a slogan.** Discovery search and filters, the
  tournament tabs, the schedule's filters and pagination, all three draw views, sign-in,
  and the regulations reader render and function with scripting off, verified with
  `javaScriptEnabled: false`.
- **Winner signalling never relies on colour.** Bracket rows carry sr-only "Winner
  advancing:"/"Opponent beaten:" spans; the Round and List views use "Winner:"; the
  winner is also bolder.
- **Every bracket node has a complete accessible name**, for example "MS · Round of 32 ·
  Srikanth Kidambi versus Panitchaphon Teeraratsakul · Score 17-21, 21-16, 21-13 ·
  Completed", better than most sports sites manage, and it rescues the truncated names
  in B-16.
- **The sign-up form is a model of WCAG 3.3.2/1.3.5 done right**: visible `<label>` on
  every field, real hints wired with `aria-describedby`, correct `autocomplete` values,
  `minlength=8`, and optional fields marked "(optional)" in the label.
- **The entry form preserves typing across a rejected submit** by design, every field is
  `defaultValue={said.*}` off the server echo, so a round trip cannot silently empty a
  form.
- **Error and empty pages are pages**, with the shell, a heading, an explanation, and a
  way onward.
- **The destructive-action pattern is right**: two-press arm with the consequence stated
  in full, a "Keep it" cancel that is the wider target, no `window.confirm`, and the row
  rewritten from the server's answer rather than optimistically.
- **Honest hedging under the tier's own constraints**, for example "Pricing: Quoted on
  the entry form before you submit" rather than an invented figure, and "Until you are
  signed in, nothing is recorded."
- **Security headers and CSP are exemplary and cost the user nothing.**

## Cross-referenced defects (not re-reported)

These are already logged in `docs/reference/debt-log.md` and are referenced here rather
than repeated as findings:

- Public player detail answers 422, not the uniform 404, for a non-UUID key
  (`apps/api/src/entries/entries_site.py`, `apps/entrant/app/routes/player.tsx`); A-23
  folds into this entry.
- The tournament overview's "Players entered" figure sums Entries-flow `entryCount`,
  which is 0 for imported tournaments whose Players tab lists hundreds
  (`apps/entrant/app/routes/tournament.tsx`).
- The entry page renders "Sign out" unconditionally, pinned by
  `apps/entrant/tests/logout.test.ts`, even though the page's header already branches on
  session state (`apps/entrant/app/routes/enter.tsx`, `apps/entrant/app/components/PlayShell.tsx`).

## Not testable on the demo data

| Journey | Blocked by | What would be needed |
|---|---|---|
| The entry wizard itself (participant fields, per-person event cap, missing partner email, running total, sticky total bar, review and acknowledgement, submit, receipt) | Every one of the 30 seeded tournaments has 0 open events | One seeded tournament with `entries_open = true`, a future `entries_close` date, at least one singles and one doubles event with fees, and one age-bracketed event so the age branch fires |
| Player pages (`/e/{slug}/players/{key}`), including the missing directory entry point (see B-10) | No page on the site links to one; the Players directory's 265 focusable elements all target `?tab=draws#draw-XX`; imported rosters have dead-resolution identities that are never linked, by rule | A seeded tournament whose confirmed entrants are real entrant accounts with `entrantsPublished = true`, so at least one directory name is a link |
| Receipt and withdraw (`/e/{slug}/receipt/{id}`, `/e/me/entries` with rows) | Both require a submitted entry, which requires an open tournament | Same as the entry-wizard row, plus one pre-seeded submitted entry against the signed-in demo account |
| Discovery live strip (`NowStrip`, `Now playing`) | Renders only when the server's listing payload reports something happening now; nothing is live on the current seed | One tournament dated today with `draws_published`, so the band and its `.sw-sweep` signal render |
| In-flight and 5xx states | No route could be made to time out or 500 on this build; the reported `/e/{slug}/players/{key}` 500 answers a clean 404 here | A fault-injection switch, or a paused API container, to observe what the tier renders when an upstream read fails |

## Suggested batches

Batch 1, Blockers:

- B-1, signup weak-password JSON page: `apps/api/src/identity/entrants_routes.py` and `apps/entrant/app/routes/signup.tsx`.
- B-2, bracket Find inert: `apps/entrant/app/routes/draw.tsx`.
- B-3, bracket reflow and keyboard trap: `apps/entrant/app/routes/draw.tsx`.

Batch 2, Majors:

- A-1/A-3, page title off the ladder: `packages/design-system` fontSize scale, `apps/entrant/app/lib/ui.ts`.
- A-4/A-5/A-6, three eyebrow constructions: `apps/entrant/app/lib/ui.ts`.
- A-9, button radius by size: `apps/entrant/app/lib/ui.ts`.
- A-13, hard-shadow press twin: `apps/entrant/tests/uiTwins.test.ts`.
- B-15/A-20, heading outline: `apps/entrant/app/routes/discovery.tsx`, `apps/entrant/app/components/SectionCard.tsx`.
- B-4, search focus ring and visible submit: `apps/entrant/app/routes/discovery.tsx`.
- B-5, raw event codes in schedule filter: `apps/entrant/app/routes/schedule.tsx`.
- B-6, inconsistent date formatting: `apps/entrant/app/lib/format.ts`.
- B-7, withdraw live region and focus: `apps/entrant/public/assets/my-entries.js`.
- B-9, "Check spelling" empty state: `apps/entrant/app/routes/discovery.tsx`.
- B-11, reflow overflow at 320px: `apps/entrant/app/routes/tournament.tsx`, `apps/entrant/app/routes/regulations.tsx`.

Batch 3, Minors and Nits:

- A-2, off-ladder `text-xl`: `apps/entrant/app/routes/regulations.tsx`, `apps/entrant/public/assets/receipt.js`.
- A-11, select radius: `apps/entrant/app/routes/partner.tsx`.
- A-12, off-ladder heights: `apps/entrant/app/components/MatchCard.tsx`.
- A-21, untokened motion duration: `apps/entrant/app/app.css`.
- A-24, 44px hit areas: `apps/entrant/app/routes/draw.tsx`, `apps/entrant/app/components/PlayShell.tsx`.
- B-8, sign-up copy: `apps/entrant/app/routes/enter.tsx`.
- B-10, Players tab chips: `apps/entrant/app/routes/tournament.tsx`.
- B-12, form resubmission feedback: `apps/entrant/public/assets/entry-wizard.js`.
- B-13, dead wizard-nav anchors: `apps/entrant/app/routes/enter.tsx`.
- B-14, shared tab titles: `apps/entrant/app/routes/tournament.tsx`.
- B-16, bracket truncation allowlist decision: `apps/entrant/tests/noTruncation.test.ts`.
- B-17, small tap targets on discovery: `apps/entrant/app/routes/discovery.tsx`.
- B-18, withdraw affordance styling: `apps/entrant/public/assets/my-entries.js`.
- B-19, unlabeled/mismatched counts: `apps/entrant/app/routes/schedule.tsx`.
- A-8, arbitrary font-weight bracket: `apps/entrant/app/components/MatchCard.tsx`.
- B-20, unlabeled filter selects: `apps/entrant/app/routes/schedule.tsx`.
- B-21, live-region overuse: `apps/entrant/app/routes/enter.tsx`.
- B-22, accessible-name apostrophes: `apps/entrant/app/routes/draw.tsx`.
