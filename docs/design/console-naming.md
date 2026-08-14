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
| Workspace settings page | **Settings** (nav + H1) | The workspace name already lives in the header chrome; it is not repeated in the H1. |
| Conjunctions | **"and"**, never "&" | "Venue and schedule", "Members and roles", "Sync and backups", "Court order and visibility", "Alerts and activity". Applies to nav labels, H1s, and section titles. Player-pair name joins ("A / B" or "A & B") are name formatting, not conjunctions, and are governed by the match-presentation rules instead. |
| Participant entry (bracket picker) | **"Save participants"** / **"Save pairs"** | Retires "Commit" / "Commit pairs" (git vocabulary). Verified against behavior: these buttons replace the event's participant list only — they do **not** generate or lock the draw, so the directive's suggested "Lock draw" label would have mislabeled them. The action that creates the bracket is the row-level **Generate draw**. |
| Solver actions (Plan toolbar) | **"Re-plan day"** (full re-solve, replaces the plan); **"Generate meet"** (first solve) | Retires "Re-solve meet" as button copy. Composes with the existing warm-restart action **"Re-plan from here"** (mid-day, keeps started/finished fixed, stays close): *day* = the whole plan from scratch, *from here* = the rest of the day, minimally disturbed. |
| Module tri-state | **On / Available / Off** (workspace builder) | Retires "Later". Matches the Modules catalog vocabulary (Enabled / Available / Off) and the backend statuses (`enabled` / `available` / `disabled`). |
| Config surfaces | Meet **Configuration**, Bracket **Configuration** | Unchanged — the section headers disambiguate. |
| Header status chip | **Silent when idle** — a quiet dot (aria-label "App status") that keeps the popover reachable; the label appears only when it says something ("Solving", "Degraded") | The bare "● Idle" chip was retired: a resting solver is not information the operator needs pushed at them. The Plan footer still says "Solver idle…" where solving is actually done. |
| Workspace header gear | Labelled **"Workspace"** (glyph + text) | Disambiguates from the rail's account-settings gear — same icon, different scope, both visible at once. |
| Lifecycle on Settings | **Display-only** (derived badge); the one explicit action is **Archive / Unarchive** in the danger zone | Retires the stored-status dropdown the app ignored. |

## Locale

en-US spellings in all user-facing copy: Optimization, utilization, organizer,
color, finalize. Code identifiers, API field names, and the generated DTO file
(`dto.generated.ts`, regenerated from backend docstrings) are exempt — copy
changes never touch stored data or wire formats.

## Form patterns

Exactly two, chosen per what the form does:

1. **In-place save** — settings the operator edits and stays on (Profile,
   workspace Settings): Save sits top-right of the form's section header,
   matching the primary-action rule (content-header top-right).
2. **Terminal create** — a form the operator leaves on success (New
   workspace): Cancel bottom-left, primary create action bottom-right.

## Retired terms (grep list)

These must not reappear in user-facing strings: "Links & access" (H1),
"Commit" / "Commit pairs" (buttons), "Re-solve meet", "Later" (module
tri-state), "Run" (nav label / surface name), "&" in nav, H1, or section
labels, and British spellings (-ise/-isation/-our, "organiser") in rendered
copy.
