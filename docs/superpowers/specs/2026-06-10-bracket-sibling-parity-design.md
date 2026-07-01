> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Bracket sibling-mode parity — design

**Date:** 2026-06-10  
**Status:** design / pending user review  
**Branch:** `feat/bracket-sibling-parity-spec`  
**Source:** user direction: "make the bracket side's UI also match the meet side since its UI is more polished" and choose "sibling mode" rather than an exact clone.

## Goal

Bring the bracket surface up to the same maturity level as the meet-day cockpit while keeping it a distinct sibling mode.

The meet side remains the reference standard for operational trust: clear status, predictable writes, strong error handling, polished layout, and enough feedback that a tournament director can use it under gym-floor pressure. The bracket side should inherit that discipline without becoming a copy of the meet workflow. Bracket is a draw/event desk first, then a live operations surface once matches are scheduled.

## Product posture

Meet mode is the live operations cockpit: dense, status-forward, optimized for calling, starting, scoring, repairing, and displaying matches.

Bracket mode becomes the tournament desk: event-oriented, draw-aware, calmer in setup/draw phases, but just as dependable in schedule/live phases. It shares the design system, interaction patterns, save/error language, and backend safety expectations with meet. It keeps its own workflow hierarchy: Setup, Roster, Events, Draw, Schedule, Live.

## Non-goals

- No new bracket capabilities in the parity pass.
- No route removals or DTO reshaping that would break existing clients.
- No visual redesign of the meet side except small consistency fixes discovered while using it as the reference.
- No wholesale replacement of the existing bracket frontend.
- No immediate all-at-once commandQueue migration for every bracket operation.
- No cloud-scale architecture change; the current local-first director-laptop model remains the target.

## Scope

### Track 1 — Bracket UI parity, behavior-preserving

Upgrade the bracket UI so it feels intentionally designed inside the ShuttleWorks shell rather than ported from the old tournament product.

Expected work:

- Align bracket page headers, section headers, density, spacing, button hierarchy, and status affordances with meet patterns.
- Improve empty states for fresh bracket tournaments, empty roster, no generated draws, no scheduled rounds, and no live matches.
- Improve loading and error states for bracket polling/API failures.
- Make action placement consistent: primary action near the relevant state, secondary/destructive actions visually quieter.
- Keep bracket-specific hierarchy: Events and Draw should not be forced into meet's Matches mental model.
- Preserve current data flow and behavior during this pass. UI changes should make existing functionality clearer, not add new functionality.

Acceptance for this track:

1. Existing bracket actions remain available in the same workflow phases.
2. Existing bracket tests continue to pass.
3. No meet UI regression.
4. Bracket views visually read as siblings of meet views: same system, different mode.

### Track 2 — Bracket backend hardening

Bring bracket backend behavior closer to meet-day reliability. This is a test-first bugfix and hardening pass, not a feature pass.

Expected audit/fix areas:

- Role gates on all bracket read/write routes.
- Structured conflict/error behavior where the meet side already has a pattern.
- Transaction safety for result recording, match action, advancement, import, wipe/delete, pin, and schedule-next.
- Stale or conflicting write behavior for concurrent operators.
- Illegal transition protection for bracket match start/finish/reset and result overwrite cases.
- Outbox/sync correctness for bracket events, participants, matches, and results.
- Persistence consistency after regenerate, import, delete event, delete session, and schedule-next.
- Idempotency opportunities for dangerous bracket writes where retry can duplicate effects.

Acceptance for this track:

1. Every backend fix starts with a failing pytest that demonstrates the bug or gap.
2. Route shapes stay compatible unless the test proves the current shape is wrong.
3. Existing backend tests remain green.
4. New tests document the meet-style guarantee being added.

### Track 3 — Command architecture bridge

Prepare bracket operations for command-style reliability without forcing the frontend onto the meet command queue in the first pass.

Expected work:

- Identify bracket operations that map cleanly to commands: match start, finish, reset, and possibly result recording.
- Keep broader event-level operations separate for now: create/update event, generate draw, import, wipe, and schedule-next are not simple match status commands.
- If backend command primitives are added, they must preserve current API behavior or sit alongside current routes.
- Defer frontend commandQueue adoption until backend semantics are proven and a later UI pass can show pending/applied/conflict states clearly.

Acceptance for this track:

1. No user-visible behavior changes are required to land backend command foundations.
2. The command model does not flatten bracket-specific concepts into meet-only match actions.
3. A later implementation plan can choose whether this track lands in the first PR or remains documented follow-up.

## Proposed phases

### Phase 1 — Reference audit

Audit meet views and bracket views side by side, then create a route-by-route and component-by-component parity map.

Outputs:

- List of meet patterns bracket should reuse.
- List of bracket-specific differences to preserve.
- Bug inventory split into UI polish, backend correctness, and command-architecture follow-up.

### Phase 2 — UI sibling pass

Apply the behavior-preserving bracket UI polish. Work in small slices by view: Setup, Roster, Events, Draw, Schedule, Live.

The likely order is:

1. Shared bracket chrome and headers.
2. Setup/Roster/Events empty and loading states.
3. Draw/Schedule visual hierarchy and action placement.
4. Live status treatment and empty/error states.

### Phase 3 — Backend hardening pass

Write failing backend tests for confirmed bracket gaps, then fix them one at a time.

Priority order:

1. Data-loss or duplicate-write risks.
2. Incorrect authorization or role behavior.
3. Result/advancement consistency.
4. Stale/concurrent write behavior.
5. Outbox/sync consistency.
6. Error shape consistency.

### Phase 4 — Command bridge decision

After backend hardening, decide whether a first command bridge should land immediately or be split into a follow-up. The default is conservative: document and prepare the backend seam, but avoid frontend commandQueue migration until it can be tested end to end.

## Design principles

- Meet is the maturity reference, not the visual template to copy line-for-line.
- Bracket remains draw/event-first.
- Behavior-preserving UI changes are allowed; functionality changes are not part of the parity pass.
- Backend hardening must be test-first.
- Prefer existing ShuttleWorks components and patterns over new abstractions.
- Improve only the surfaces touched by this effort; avoid unrelated redesign or refactor.

## Risks

- The scope can balloon if "match meet polish" becomes a full bracket redesign. Mitigation: view-by-view slices and explicit no-new-capability rule.
- Command parity can become a hidden frontend behavior change. Mitigation: bridge backend first, defer queue adoption until semantics are proven.
- Snapshot-based tournament state may hide multi-tab overwrite issues. Mitigation: include it in the backend/frontend audit, but fix only confirmed bracket-impacting bugs in this pass.
- Bracket backend routes are broad, and `api/brackets.py` is large. Mitigation: add focused tests around route behavior before touching internals.

## Testing strategy

- Frontend: Vitest/RTL tests for changed bracket components, especially empty/loading/error/action states.
- Backend: pytest for each hardening fix, written before implementation.
- E2E: run existing scheduler e2e smoke where practical after UI changes; add only targeted e2e coverage if a bracket flow lacks regression protection.
- Visual verification: use browser screenshots for bracket pages after UI changes, comparing against meet-side polish and checking desktop/mobile fit.

## Acceptance criteria

The initiative is successful when:

1. Bracket mode feels like a first-class sibling of meet mode.
2. Bracket views preserve existing functionality and workflow order.
3. Bracket backend has tests for the highest-risk write paths and confirmed bugs are fixed.
4. Any command-queue migration remains deliberate, documented, and behavior-compatible.
5. The branch can be reviewed in coherent commits: spec, UI parity slices, backend hardening slices, and optional command bridge.
