# SP-CONSOLE-2 — operator-surface course of action (PDF review follow-up)

**Type:** Design + behavior. Successor to SP-CONSOLE-REFINE (complete 2026-08-17,
ledger `CONSOLE_REFINE_PROGRESS.md`). Source: the owner's item-by-item course of
action over the operator review PDF (`docs/screenshots/report-2026-08-17/`, 26pp)
— every item below carries the owner's stable ID; do not renumber.

**Unlike its predecessor, this program is full-stack** (owner ruling 2026-08-17):
backend changes are in scope where an item needs them (WSB-3 retention +
download/delete endpoints, MAT-2 result-lock, WSMOD-2 pre-flight disable reason,
TV-3 ETA in the public projection). Everything else stays presentation-layer.

**Before artifact:** the 2026-08-17 report + PDFs. Branch: new, off
`dev/prog1-p6-2-public-ia` once that merges, else off it directly — suggested
`design/console-2`.

---

## Owner rulings (amendments to the item list — these win over the item text)

- **R-A (WSSET-1/ACC-3): BOTH renames.** Account surface nav + H1 → **"Account"**;
  workspace settings nav + H1 → **"Workspace settings"**. Bare "Settings" retires
  as a nav label entirely (greppable). This revises two G1 glossary entries —
  update `docs/design/console-naming.md` (canonical table + retired list) in the
  same commit.
- **R-B (NEW-2/WSMOD-1): collapse at create.** New-workspace form offers **On/Off
  only**; anything not-On seeds as `available` (backend already behaves this way —
  frontend-only change). The Modules **catalog keeps On / Available / Off**; the
  G1 "Available" ruling survives there, only the builder entry is revised.
- **R-C (TV-2): consistent score-card design, no new score data.** TV court cards
  adopt the **same score-lane anatomy as the app's other score cards** (MatchCard
  `ScoreLane` per-set columns / Display board card mode), rendering persisted sets
  where they exist and nothing where they don't. The score slot is a designed part
  of the card so a future score relay/recording app can light it up live — that
  app is future work; **no sets-column migration, no live score entry, this
  program**. TV-2's "score ~38% of card height" applies to the slot's layout
  budget, populated or not.
- **R-D (scope): one program**, sequenced as below. No split, no deferral of the
  backend-touching items.

## Standing constraints (carry-overs — violations are findings, not judgment calls)

1. **Gates baseline (don't regress):** `make check` exit 0 · vitest ≥1751 ·
   entrant ≥586 (**run solo** — concurrent with the frontend suite it throws a
   transient typegen error) · pytest green · contrast 64/64 both themes ·
   eslint/tsc/depcruise 0 errors. Run the full gate at every phase close.
2. **Naming changes land in `docs/design/console-naming.md` + its retired-terms
   grep list in the same commit** — that file is X1's enforcement mechanism; it
   already exists.
3. **`window.confirm` is banned** (interaction-bug audit, 0 call sites). Every
   "confirm dialog" below means the repo's existing two-click-arm / guarded-action
   pattern.
4. **G1 rulings not amended above must not regress:** "Live day"/"Open live day",
   "Re-plan day" vs "Re-plan from here", "Save participants/pairs", "Sharing",
   "and" not "&", en-US, header status chip silent when idle, workspace header
   gear labeled "Workspace", lifecycle display-only + Archive/Unarchive.
   Standing deviations stay standing: chip fills one shade deeper than mock
   (contrast gate), A4.1 middot, P2.1 public-tier UTC labels, EntriesDesk/director
   "Commit" retained.
5. **X1 grep scope = rendered copy only.** Code identifiers, the state-machine
   enum (`scheduled→called→playing→finished|retired`), API fields and
   `dto.generated.ts` are exempt — same exemption the locale rule uses.
6. **New backend list/queries keep the stable tiebreaker** (`created_at DESC, id
   DESC`); new workspace routes take the `tournament_id` +
   `require_tournament_access` seam (the OpenAPI-derived tenant test will fail CI
   otherwise).
7. Session protocol: read the ledger (`docs/programs/CONSOLE2_PROGRESS.md`,
   created in Phase 0) at session start, update at session end. Commit per phase
   or finer; path-limited commits (`git commit -- <paths>`) if agents run
   concurrently.

## Pre-resolved item notes (apply as written)

- **PLAN-2** is smaller than written: "Plan ready ✓ / Mark plan ready" is already
  a toggle (G1). The work is restyling the **on-state** as the lifecycle pill the
  Live-day header uses — keep the click-to-unready behavior.
- **X1 glossary gains DUE** (introduced by LIVE-1): DUE at zero, amber LATE +N
  past a threshold, red past a bigger one. Pick thresholds in Phase 1 and write
  them into the glossary.
- **WSB-1**: renaming to "Backups" is correct (sync was removed in SP-CLOUD-3) —
  the glossary currently canonizes "Sync and backups"; update it.
- **DC-1**: existing `tv*` config blobs may hold the retired Strip mode — map it
  to Auto on read; no migration.
- **TV-8**: the operator `/tv` preview keeps its chrome; only the **public
  capability-token render** is stripped.
- **INS-2's gear** is the Hub-inspector gear, not the workspace header gear G1
  already labeled — a different control; both items stand.
- **CFG-3 and BRST-3 are no-ops** (pattern references), kept for ID continuity.

---

## The item list (owner-authored, IDs stable)

### Cross-cutting (apply everywhere, do first)

- **X1 — State glossary.** One term per state, enforced by grep: LIVE (not
  PLAYING), CALLED, DUE, LATE (only past a real threshold), READY, PENDING (not
  WAITING), DONE. One label per concept: "Up next" (not "Next up"). Touches
  /live, /tv, /matches, /bracket-matches, /schedule, /overview, hub inspector.
- **X2 — SettingsRow / SettingsSection primitives.** Fixed label column left,
  fixed right-edge control column with standard width slots (xs toggle / sm
  number+unit / md segmented / full text). One content max-width, one gutter,
  collapsible section headers everywhere. Touches /setup, /bracket-setup,
  /ws-venue, /ws-settings, /display-config, /new, /settings.
- **X3 — Done-row treatment.** Completed matches keep a muted DONE chip; score
  sits beside it, never replaces the status column. Touches /matches,
  /bracket-matches.
- **X4 — One LIVE chip component** (outlined pill + dot) for
  headers/rows/inspectors; solid green bar reserved for court cards on ops/TV
  surfaces only.
- **X5 — Status color tokens:** `--status-live`, `--status-called`,
  `--status-late`, `--success`, `--accent`. Green stops meaning four things.

### / — Workspace list (Hub)

- **HUB-1.** Make "Open live day" in the Next action column an actual link/button
  (accent color, hover state). It's currently gray text identical to the date.
- **HUB-2.** Filter chip format: match Matches (All · 1, Live · 1).
- **HUB-3.** Replace the M/D/B module chips column with a health/attention glyph
  from signals — modules are static config, attention is operational and already
  computed. Modules stay in the inspector.
- **HUB-4.** "Create your next workspace" → "Create a workspace."

### / — Hub, row selected (inspector)

- **INS-1.** "THIS EVENT" → "THIS WORKSPACE" (or drop the label; the header above
  already names it).
- **INS-2.** The gear button next to "Open live day" — label it or merge into the
  overflow; naked gear duplicates the sidebar gear ambiguity.
- **INS-3.** "Next up" → "Up next" (X1).
- **INS-4.** Add court-count/free-court line to the stat band during LIVE —
  played/remaining/total is planning info; playing-now is the live signal.

### /new — New workspace

- **NEW-1.** Delete the "CONTROL PLANE" eyebrow → "Workspace" or nothing.
- **NEW-2.** Per ruling R-B: collapse to On/Off at create; seed anything not-On
  as available under the hood.
- **NEW-3.** Apply X2 — the segmented controls, courts input, and full-width
  name/date currently follow three different layouts.
- **NEW-4.** Venue section: add day window (start/end) here or don't ask about
  courts either — asking half the venue question splits config across two
  surfaces. Reconcile with WSV-2: one owner for venue config, the other links to
  it.

### /settings — Account

- **ACC-1.** "Save changes" floats mid-page attached to a collapsible header —
  move to a consistent position per the glossary's in-place-save pattern, same as
  /ws-settings.
- **ACC-2.** Apply X2 (full-width slot).
- **ACC-3.** Per ruling R-A: this surface becomes **"Account"** (nav + H1);
  workspace settings becomes "Workspace settings" (WSSET-1).

### /overview — Workspace overview

- **OV-1.** "Next up" → "Up next" (X1); make the three rows clickable → opens
  that match in /live inspector.
- **OV-2.** "Public display: Live link" → "Active" + copy icon, or the actual
  short URL.
- **OV-3.** "Collaborators: 1 member" → "Members: 1."
- **OV-4.** Add free-courts / playing-now to IN PROGRESS during LIVE (same
  rationale as INS-4).
- **OV-5.** Right column rows (Event date, Public display, Collaborators) are
  each links to admin pages — style them as such.

### /roster — Meet · Roster

- **RST-1.** Header says "48 players," primary says "+ Add school" — retitle
  header "2 schools · 48 players" so the primary matches the object model.
- **RST-2.** The unlabeled "2" per player in the left list needs a column header
  ("Events") or a tooltip — or drop it if it's always 2 in dual meets.
- **RST-3.** "Filter 24 players…" placeholder hardcodes the count of the active
  tab while the header says 48 — just "Filter players…".

### /matches — Meet · Matches (+ detail panel)

- **MAT-1.** Apply X3: done rows get DONE chip + score.
- **MAT-2.** "Regenerate from roster" gets a guarded confirm (two-click arm)
  stating what's destroyed, and is disabled (with the existing lock-banner
  pattern) once any result exists.
- **MAT-3.** Winner dot before side A names: move winner indication into the
  result/status cell — a green dot floating before a name reads as presence/live
  at scan speed.
- **MAT-4.** Detail panel: "NBA"/"MCS" school chips use red/orange dots — both
  are alarm colors in the token set. School identity should use non-semantic hues
  (X5).
- **MAT-5.** Detail panel shows Court 6 · 09:00 at the bottom under RESULT for a
  finished match — for READY/LIVE matches surface court + planned time at the
  top; it's the operational fact.

### /setup — Meet · Configuration

- **CFG-1.** Apply X2 wholesale — this page is the template; its section
  structure is right, its control widths aren't.
- **CFG-2.** Slider row (Court utilization weight): fixed track width, value in a
  fixed-width slot ("50") so it right-aligns with the number inputs.
- **CFG-3.** The lock banner is good — keep as the pattern referenced by MAT-2.

### /bracket-roster — Bracket · Roster

- **BRST-1.** MIN REST column is all 1s — remove the column; show a badge only on
  players whose value differs from default, edit in a row detail.
- **BRST-2.** The MDC (1) / XDC (4) chip suffixes are unexplained (seed?
  entries?) — label or tooltip.
- **BRST-3.** Header "+ Add player" vs Meet's "+ Add school" — fine to differ
  (different models) once RST-1 makes Meet's header honest.

### /bracket-draws — Bracket · Draws

- **DRW-1.** The PROGRESS cell (DONE 8 READY 4 PEND 3) is dense text with
  color-only differentiation — render as mini chips or a stacked bar with counts;
  and PEND → PENDING or a chip (X1).
- **DRW-2.** "Open draw →" text link at row end + code link at row start = two
  navigations per row; make the whole row clickable, keep one affordance.

### /bracket-draw — Draw open

- **DRAW-1.** Winner cards: drop the saturated green fill → subtle green tint +
  3px left border + bold names (X5). Loudest element in the app currently, on the
  least operational surface.
- **DRAW-2.** The R1/QF/SF/F round mini-nav top-left and the DONE/READY/PEND
  counts top-right are good; move counts into the same visual container as the
  round nav so the toolbar reads as one strip.
- **DRAW-3.** Slot/court captions on cards (slot 5 · court 8) are near-invisible
  gray-on-white — one step darker; they're the only schedule info in the tree.

### /bracket-matches — Bracket · Matches (+ detail panel)

- **BMAT-1.** Apply X3 (done rows).
- **BMAT-2.** Winner dot: same fix as MAT-3.
- **BMAT-3.** Detail panel: side entries here are bare names with chevrons while
  Meet's panel shows chips and add-player affordances — unify on one
  MatchCard-side component (the PDF shows the divergence exactly).
- **BMAT-4.** TBD italics for pending slots: use "Winner of QF1" like the queue
  already does — the provenance exists, show it.

### /bracket-setup — Bracket · Configuration

- **BCFG-1.** Apply X2. The read-only summary rows (MDC/WDC/XDC lines) mix with
  editable rows — give read-only rows a distinct flat treatment so the page
  doesn't look uniformly editable.
- **BCFG-2.** "Manage draws" / "Manage participants" buttons inside Events
  section navigate away — style as links-with-arrow, not buttons, to distinguish
  navigation from mutation.

### /schedule — Operations · Plan

- **PLAN-1.** Grid cell colors (solid green, burnt orange) get a legend chip row
  in the toolbar, or switch cells to the Live-day chip language. Full-cell
  saturated fills contradict X5.
- **PLAN-2.** Restyle the "Plan ready ✓" on-state as the lifecycle pill /live
  uses ("Plan finalized"); keep the toggle behavior (see pre-resolved notes).
- **PLAN-3.** "UP NEXT · 28" list: the leading green/orange dots are unexplained
  — same legend as PLAN-1 covers them.
- **PLAN-4.** Footer "Solver idle. A schedule is in place; Re-plan day replaces
  it." is good copy — promote it near the Re-plan button, since that's the
  destructive-ish action it explains. This is also the solver-state chip STOP:
  this footer is the natural seed for it.

### /live — Operations · Live day (+ inspector)

- **LIVE-1.** LATE +0 → render DUE at zero, amber LATE +N past threshold, red
  past a bigger threshold (X1, X5).
- **LIVE-2.** Queue WAITING → PENDING (X1).
- **LIVE-3.** Stat band: retitle 34/84 DONE → "34/84 done · meet + bracket"
  (scope label, matching Display's footer honesty).
- **LIVE-4.** Inspector State: PLAYING → LIVE (X1); the MEET chip sits under
  "STATUS" but is a source badge — label it "Source."
- **LIVE-5.** "Postpone — returns the match to the queue. Nothing is lost."
  Excellent copy; keep as the model for destructive-adjacent explanations (MAT-2,
  backups).
- **LIVE-6.** LIVE · 0:00 on courts — a zero-duration live match reads as a bug;
  suppress the timer for the first minute or show "just started".

### /tv — Display · Preview

Per the research (3-second rule, 1-inch-per-10-feet, density caps, rotation):

- **TV-1.** Court cards: two lines of surname pairs ("FAKHOURI / WHITMORE" vs
  line), not four full names.
- **TV-2.** Per ruling R-C: the score lane is the dominant card element (~38%
  card height layout budget) using the app's shared score-card anatomy, populated
  from persisted sets where they exist; designed to accept live scores from a
  future score-relay app.
- **TV-3.** Per-card next line: "next: MD2 ~11:00" — surfaces the ETA moat
  publicly.
- **TV-4.** CALLED preemption banner: full-width strip "NOW CALLING · MD5 →
  COURT 3" for a fixed dwell when a match enters CALLED.
- **TV-5.** Standings panel → rotation slide or one-line footer ticker ("NBA 8–4
  MCS"). Reclaims ~35% width for the court grid.
- **TV-6.** Auto layout = the grid algorithm: cols =
  clamp(round(sqrt(N·A/a)),1,4), paginate past 12 courts, type scale derived from
  card height. Card size setting becomes an override. **Pure unit-testable
  contract** — negative control: remove the pagination cap, the min-card-area
  property test must fail.
- **TV-7.** Rotation engine: courts (20s) → standings/bracket (10s) → up-next
  queue (10s); stale feed renders last-known-good, never an error (existing
  invariant).
- **TV-8.** Strip the operator chrome from the public render only: no tab pills,
  no fullscreen button; thin header (name + clock), thin footer (progress only —
  drop "2 active · 2 called" legend). Operator preview keeps its chrome.

### /display-config — Display · Configuration

- **DC-1.** Retire Strip mode (unusable on a passive TV); modes become Auto /
  Grid / List, with Auto the default doing TV-6. Map stored `strip` to Auto on
  read.
- **DC-2.** Feeds: Meet [On] Bracket [On] chips ambiguous between toggle and
  readout — make them real toggles with the toggle component.
- **DC-3.** Add rotation settings (slide set + dwell seconds) replacing Standings
  mode's Side/Rotate — rotation subsumes it.
- **DC-4.** Public URL field: ensure the rendered origin flows from config; add
  the CI grep here.
- **DC-5.** Apply X2.

### /ws-venue — Venue and schedule

- **WSV-1.** Apply X2 (currently a third layout dialect: left-anchored medium
  inputs, no sections).
- **WSV-2.** Reconcile with NEW-4 — courts asked at create, day window asked
  here; one owner for venue config, the other links to it.

### /ws-members — Members

- **WSM-1.** Move "must always have at least one owner…" out of the resting card
  — show only on attempted removal/transfer.
- **WSM-2.** Role legend (Owner/Operator/Viewer definitions) → collapse behind an
  info icon; it's onboarding copy occupying permanent space.
- **WSM-3.** Check the Joined Aug 11 > event Aug 10 timestamp source.

### /ws-sharing — Sharing

- **WSS-1.** The two-section split is right; make section cards visually
  parallel (public link section has inline actions, invites has a form row —
  align their internal layout).
- **WSS-2.** "Every venue display has to be re-shared" after Rotate link — good
  warning; move it into the confirm dialog rather than resting text, matching
  WSM-1's principle.
- **WSS-3.** DC-4's origin-from-config grep applies to the rendered URL here too.

### /ws-modules — Module catalog

- **WSMOD-1.** Per ruling R-B: the catalog keeps the "Available" chip +
  "Enable" — no rename needed; verify chip vocabulary matches the glossary.
- **WSMOD-2.** "Disable" as bare text-button on enabled modules — give it the
  guarded treatment ("a module with data can't be disabled" surfaces before click
  as a disabled state with reason, not as a 409 after).

### /ws-sync — Backups

- **WSB-1.** Rename nav + page to "Backups" (no sync content exists). Update the
  glossary's "Sync and backups" entry.
- **WSB-2.** Restore buttons → neutral secondary; red + "replaces current state"
  copy moves into the guarded confirm.
- **WSB-3.** Coalesce auto-backups (keep last N per hour/day), add download +
  delete per row — a live day will produce hundreds of identical rows.
- **WSB-4.** Filename as the row's second line is scaffold — show "Auto ·
  5:16 PM · 45.1 KB," filename behind the overflow.

### /ws-settings — Workspace settings

- **WSSET-1.** Per ruling R-A: nav + H1 → **"Workspace settings"**; account
  surface → "Account" (ACC-3). Glossary + retired-terms list updated same
  commit.
- **WSSET-2.** Apply X2; Save button position per ACC-1.
- **WSSET-3.** Lifecycle row showing the LIVE pill + "derived from match state"
  copy is good — this is the lifecycle-STOP surface; the pill here and the header
  chip should be the same component (X4).

---

## Phases

**Phase 0 — Baseline (STOP at end).** Read `CONSOLE_REFINE_PROGRESS.md`,
`docs/design/console-naming.md`, this file, `git log --oneline -15`. Run the full
gate, record numbers. Create `docs/programs/CONSOLE2_PROGRESS.md` (ledger header:
nature, gates baseline, phase table). Map landing zones with file paths for the
non-obvious items (X2 primitive location, TV-6/7 home, WSB-3 backend seams,
HUB-3 signals source, WSM-3 timestamp source) and flag any item whose premise the
code contradicts. **STOP — report the map and plan.**

**Phase 1 — X1 + X5** (glossary + tokens). Includes the DUE/LATE thresholds, the
`console-naming.md` state table + retired-terms additions (PLAYING, WAITING,
"Next up", PEND, "Sync and backups", bare "Settings" nav label), and the R-A/R-B
renames since they're glossary work: ACC-3, WSSET-1, NEW-2, WSMOD-1, WSB-1,
INS-1, INS-3, OV-3, HUB-4, NEW-1, LIVE-2/-4, DRW-1's PEND half.

**Phase 2 — X2 sweep.** Build SettingsRow/SettingsSection once, roll out: CFG-1,
CFG-2, BCFG-1, WSV-1, WSSET-2, ACC-1/2, NEW-3, DC-5. Resolve NEW-4/WSV-2
ownership while both pages are open.

**Phase 3 — X3/X4 + list & ops surfaces.** MAT-1..5, BMAT-1..4, DRW-1 (visual
half)/-2, DRAW-1..3, HUB-1..3, INS-2/4, OV-1/2/4/5, RST-1..3, BRST-1..2,
BCFG-2, PLAN-1..4, LIVE-1/3/5/6.

**Phase 4 — TV + display-config.** TV-1..8, DC-1..4. TV-6 lands with its
property test + negative control. TV-3's ETA and any projection additions go
through the Display-owned capability-token routes (strict projection — no raw
UUIDs).

**Phase 5 — Guardrails + admin.** MAT-2, WSB-2/3/4, WSMOD-2, WSM-1..3,
WSS-1..3. Backend work rides here (WSB-3 endpoints + retention, WSMOD-2
pre-flight reason, MAT-2 result-lock) under constraint 6.

**Phase 6 — Recapture + report (STOP at end).** Playwright recapture per the
proven recipe (backend :8600 + Vite :5173 + entrant :5175, viewport 1280×900),
before/after report HTML in `docs/audits/`, ledger closed, full gate rerun.
**STOP — owner review.**
