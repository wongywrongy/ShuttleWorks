# Console naming

The single source of truth for user-facing vocabulary across the operator
console, workspace admin, and public tier (SP-CONSOLE-REFINE, G1). Two rules
govern everything below:

1. **A page's H1 echoes its nav label verbatim.**
2. **A button that navigates names its destination.**

## Canonical terms

| Concept | Canonical term | Replaces / notes |
|---|---|---|
| The live-day surface | **Live day** (nav item, page eyebrow); **"Open live day"** (buttons) | Retires "Run" as user-facing vocabulary. The route segment `/live` is unchanged. "Run" survives only as a verb ("Run the floor…"). |
| Plan-readiness chips | **"Plan ready ✓"** (Plan toolbar toggle, off-state **"Mark plan ready"**); **"Plan finalized · ready for live day"** (Live-day header pill) | One lifecycle-chip family across Plan and Live day. |
| Sharing surface | **Sharing** (nav + H1) | Retires the "Links & access" H1. Section headers inside the page stay descriptive (Public display link, Collaborator invites). Cross-links say "Sharing" — not "Settings → Sharing" — and are real links where the host component allows one. |
| Workspace settings page | **Workspace settings** (nav + H1) | Revised by SP-CONSOLE-2 R-A. Bare "Settings" is retired as a nav label everywhere: two different surfaces wore it, one per scope, and the rail showed both at once. The scope now rides in the label. |
| Account surface | **Account** (rail item + chrome title + H1) | R-A's other half. The rail gear owns the word; the avatar chip below it names the *person* (`aria-label` = display name, email fallback), because two rail links to `/settings` both announcing "Account" is the ambiguity the rename would otherwise have created. |
| Backups surface | **Backups** (nav + H1) | Retires "Sync and backups". There is no sync: the Supabase mirror was removed entirely in SP-CLOUD-3 (ADR 0012), so the nav promised a feature the page could not contain. |
| Module state at creation | **On / Off** on `/new`; **On / Available / Off** in the Modules catalog | SP-CONSOLE-2 R-B. "Available" and "Off" are the same answer before a workspace exists — neither module is on, and both are one click apart in Modules afterwards — so `/new` asks the question that has a consequence and seeds everything not-On as `available`. The catalog keeps the full tri-state. |
| Conjunctions | **"and"**, never "&" | "Venue and schedule", "Members and roles", "Sync and backups", "Court order and visibility", "Alerts and activity". Applies to nav labels, H1s, and section titles. Player-pair name joins ("A / B" or "A & B") are name formatting, not conjunctions, and are governed by the match-presentation rules instead. |
| Participant entry (bracket picker) | **"Save participants"** / **"Save pairs"** | Retires "Commit" / "Commit pairs" (git vocabulary). Verified against behavior: these buttons replace the event's participant list only — they do **not** generate or lock the draw, so the directive's suggested "Lock draw" label would have mislabeled them. The action that creates the bracket is the row-level **Generate draw**. |
| Solver actions (Plan toolbar) | **"Re-plan day"** (full re-solve, replaces the plan); **"Generate meet"** (first solve) | Retires "Re-solve meet" as button copy. Composes with the existing warm-restart action **"Re-plan from here"** (mid-day, keeps started/finished fixed, stays close): *day* = the whole plan from scratch, *from here* = the rest of the day, minimally disturbed. |
| Module tri-state | **On / Available / Off** (Modules catalog) | Retires "Later". Matches the backend statuses (`enabled` / `available` / `disabled`). The workspace builder no longer offers all three — see "Module state at creation" above. |
| Config surfaces | Meet **Configuration**, Bracket **Configuration** | Unchanged — the section headers disambiguate. |
| Header status chip | **Silent when idle** — a quiet dot (aria-label "App status") that keeps the popover reachable; the label appears only when it says something ("Solving", "Degraded") | The bare "● Idle" chip was retired: a resting solver is not information the operator needs pushed at them. The Plan footer still says "Solver idle…" where solving is actually done. |
| Workspace header gear | Labelled **"Workspace"** (glyph + text) | Disambiguates from the rail's account-settings gear — same icon, different scope, both visible at once. |
| Lifecycle on Settings | **Display-only** (derived badge); the one explicit action is **Archive / Unarchive** in the danger zone | Retires the stored-status dropdown the app ignored. |
| Status rendering in lists/panels | **X6 status ink budget** — only LIVE/CALLED/LATE/error states chip; READY/PENDING are ink-weight text; DONE is the right-aligned score itself, no label | SP-CONSOLE-3. Supersedes SP-CONSOLE-2 X3 (chip-plus-score). Ladder + exemptions in `packages/design-system/DESIGN.md` §4.1; renderer is `MatchStatus`. |
| Lifecycle chip while LIVE | **Suppressed** on all five sites (shell header, hub row, hub inspector, overview header, workspace settings) | SP-CONSOLE-3 R-D, Option A: on a live day every surface already screams it. The settings Lifecycle row keeps the word "Live" as plain text so a labeled row never renders empty. `lifecycleChip` in `platform/domain/lifecycle.ts` carries the rule. |
| Seed number | **`[n]` after the event code** (badminton draw-sheet convention), legended in the roster column header ("Events · [n] seed") | SP-CONSOLE-3 BRST-N1. Retires the `(n)` parenthetical, which read as a count; seeds are still never a separate column (SP-CONSOLE-REFINE G6/B1). |

## Match state vocabulary

One word per state, everywhere. The words live in exactly one place —
`products/scheduler/frontend/src/lib/stateWords.ts` (`STATE_WORD`) — and every
surface reads them from there. That module is the enforcement mechanism: there
is no second copy to drift.

| State | Word | Means |
|---|---|---|
| A match is being played | **Live** | Retires "Playing". The Run inspector said PLAYING while both match lists said Live for the same match. |
| Called to a court, not started | **Called** | |
| Its planned slot has arrived | **Due** | New. Not an alarm: the plan says now, and now is now. |
| One slot past its planned start | **Late** | Amber. |
| Two or more slots past | **Late**, in red | Same word, louder treatment — a second adjective would be a second thing to learn. |
| Assigned a court and playable | **Ready** | |
| Not playable yet (sides undecided, court unassigned) | **Pending** | Retires "Waiting" and the hand-truncated "PEND". |
| Result recorded | **Done** | |
| Planned, nothing else true yet | **Scheduled** | |
| No match on the court | **Free** | |
| Court withdrawn from play | **Closed** | |

One label per concept beyond the states: **"Up next"**, never "Next up" or
"Up Next".

### Casing

Casing is **not** part of the vocabulary. Every word is defined in sentence
case exactly once, and surfaces that want the board's uppercase treatment take
it from CSS — `EYEBROW_CLASS`, `StatusCount`, or a band's own class — never
from a second string constant.

This is the rule that keeps the two tiers from drifting apart again. Before it,
the bracket progress strips shipped the literal `'PEND'` purely because the
author was hand-uppercasing and wanted a short word; the CSS was already
uppercasing for them. There is now no uppercase status literal in the tree, so
there is nothing to drift.

### Timeliness thresholds

Thresholds are counted in **slots**, not minutes, and the figure beside the
word is shown in minutes (`+30`). `currentSlot` is a floored slot index
(`lib/time.ts#getCurrentSlot`), so with the default 30-minute slot a
minute-based threshold could only ever evaluate to 0 or 30 — an amber tier
expressed in minutes would never once appear on screen.

| Slots past planned start | Tier | Token |
|---|---|---|
| 0 | Due | none (keeps the status treatment) |
| 1 | Late | `--status-late` (amber) |
| 2 or more | Late | `--status-overdue` (red) |

`deriveTimeliness` in `products/operations/runtime/runMachine.ts` is the one
implementation. `deriveLate` survives as the wide "past its planned start at
all" boolean the summary band and the Plan chips already counted; it is now
expressed in terms of `deriveTimeliness` so the two cannot disagree.

**Late and Called share amber on purpose** — both mean "this needs the desk
soon". They stay legible side by side because their *form* differs: Called is a
solid filled band, Late is always a `+N` figure or an outlined nudge. On the
court band they are mutually exclusive anyway, since timeliness preempts status
from the Late tier up.

## Locale

en-US spellings in all user-facing copy: Optimization, utilization, organizer,
color, finalize. Code identifiers, API field names, and the generated DTO file
(`dto.generated.ts`, regenerated from backend docstrings) are exempt — copy
changes never touch stored data or wire formats.

## Form patterns

Exactly two, chosen per what the form does:

1. **In-place save** — settings the operator edits and stays on (Profile,
   Security, Workspace settings): Save sits top-right of the **page header**,
   on the title row, matching the primary-action rule everywhere else in the
   console.

   Revised by SP-CONSOLE-2 ACC-1. It used to sit in the first section's action
   slot, which put a primary button mid-page beside a collapsible heading while
   the title row above it stood empty — and made it read as saving that one
   section rather than the page. Both surfaces already agreed with each other;
   they agreed on the wrong position.
2. **Terminal create** — a form the operator leaves on success (New
   workspace): Cancel bottom-left, primary create action bottom-right.

Some surfaces have **no save at all** (Venue and schedule, Display
configuration): every field applies as it changes. Those say so in a line under
the page description rather than growing a button that would lie about when the
write happens.

## Retired terms (grep list)

These must not reappear in user-facing strings.

From SP-CONSOLE-REFINE (G1): "Links & access" (H1), "Commit" / "Commit pairs"
(buttons), "Re-solve meet", "Later" (module tri-state), "Run" (nav label /
surface name), "&" in nav, H1, or section labels, and British spellings
(-ise/-isation/-our, "organiser") in rendered copy.

From SP-CONSOLE-2 (X1 / R-A / R-B / WSB-1):

| Retired | Use instead |
|---|---|
| "Playing" (match state) | "Live" |
| "Waiting" (match state) | "Pending" |
| "PEND" | "Pending" (CSS uppercases it) |
| "Next up", "Up Next" | "Up next" |
| "Sync and backups" | "Backups" |
| "Settings" as a bare nav label | "Account" or "Workspace settings" |
| "Collaborators" (Overview rail row) | "Members" |
| "CONTROL PLANE" (page eyebrow) | nothing — the H1 already says it |
| "Create your next workspace" | "Create a workspace" |
| "This event" (Hub inspector) | "This workspace" |

**Scope, unchanged:** rendered copy only. Code identifiers, the state-machine
enum (`scheduled→called→playing→finished|retired`), API field names and
`dto.generated.ts` are exempt — the same exemption the locale rule carries.
`RunStatus.playing` stays `playing`; only its *label* is "Live".

A retired word is retired **as a state label**, not as English. "Waiting to
connect…", "Waiting for a draw" and a traffic-light reason reading "Playing
MD3" are sentences about what is happening, not labels naming a state, and
they stay. The test is whether the word is standing in a status slot.
