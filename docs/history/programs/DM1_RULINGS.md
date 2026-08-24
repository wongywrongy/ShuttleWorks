# SP-DM-2 — R-DM Ruling Register

**Date:** 2026-08-24 · **Participants:** Kyle (decision-maker) + agent (facilitator)
**Pinned SHA:** `e67633fe` · **Docs state:** the SP-DM-1 deliverables landed directly on
main (`0e3f7914` plan, `53b650a1` audit + design) — branch `docs/dm1-audit` never existed
as a ref, so this register lives on `docs/dm1-rulings`.
**Substrate:** `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md`
(the 13 `R-DM` decisions) + `docs/history/audits/2026-08-24-domain-model-audit.md`
(`F-DM-01..77`), both at the pinned SHA.

Session order ruled by Kyle at open: R-DM-2 → 1 → 7 → 4 → 8 → 3 → 5 → 6 → tail batch (9–13).

---

## Register

<!-- Each entry: ID · Ruling · Rationale · Resolves · Unblocks/gates · Status · Note -->

### R-DM-2 — People spine → competition spine link mechanism
- **Ruling:** Option (a) now — a real `entry_player_id` (Uuid, composite FK) on
  `bracket_participants` plus a typed `entryPlayerId` on both roster blob shapes, with the
  `entry-{uuid}` string kept as a legacy read path until P4's deletion gate closes. Option
  (c) — the Meet roster out of `tournaments.data` into a real table, FK'd on both sides —
  is **ratified as the committed end-state**, owed as its own program after P4 lands, not
  conditional on the blob being opened for another reason.
- **Rationale:** (a) is the first slice of (c), not a detour — the FK survives (c)
  unchanged; only the typed blob field is superseded. Doing (c) first would hold four
  phases hostage behind a program-scale migration (34 files / 94 sites, I8's `If-Match`
  discipline) for no added safety.
- **Resolves:** F-DM-05, F-DM-09, F-DM-10, F-DM-11 (with models.py FK parity), F-DM-22.
- **Unblocks/gates:** P4 (directly); P6, P7, P8 (transitively).
- **Status:** ruled
- **Note:** Kyle's framing — "not sure what is best long term even if it takes dev time" —
  resolved by ratifying (c) as the destination rather than leaving it conditional; this
  strengthens the plan's recommendation.

### R-DM-1 — What remains open in person minting after the 2026-08-23 ruling
- **Ruling:** Both gaps close as recommended, preserving the 2026-08-23 minting rule
  verbatim. **(i) = (a):** a second, weaker workspace-scoped advisory — same account +
  same normalized name, any event → NEEDS_REVIEW. Flag-only; I4 and "never merge by
  guesswork" hold; no schema change. **(ii) = (a):** `partners.accept()` routes through
  `same_person` and the accept form collects `birth_year`, so a partner-minted person can
  be the certain match.
- **Rationale:** The smallest diffs that make the ruled advisory promise actually true in
  the tree; neither reopens the STOP ruling, R7, R12, or the merge-tool deferral.
- **Resolves:** F-DM-01 (cross-event half), F-DM-02. (F-DM-16 is a P3 wire fix, not a
  decision.)
- **Unblocks/gates:** P3 (its shape is now fully specified).
- **Status:** ruled

### R-DM-1.x — Pull-forward: the cross-event identity fork (mini-ruling)
- **Ruling:** P3 is **pulled forward** — it ships as a standalone slice ahead of the full
  unification program, as soon as an implementation prompt for it exists. It does not wait
  for P0–P2.
- **Rationale:** The fork mints unflagged public player pages daily on live SP-P7/P8
  surfaces; P3 is S-sized, migration-free, and blocked only by R-DM-1 (now ruled). Every
  week of delay adds fragments the deferred merge tool must someday clean up.
- **Resolves:** timing only (the substance is R-DM-1's).
- **Unblocks/gates:** P3 becomes the first implementable slice; also unblocks SP-P7's two
  person-keyed deferrals sooner (per §2.1, both wait on P3+P4).
- **Status:** ruled

### R-DM-7 — Does the bracket participant id stop being a name slug
- **Ruling:** Option (a). `bracket_participants.id` keeps its String form; R-DM-2's
  `entry_player_id` FK is the identity for every participant that resolves to a person.
  No re-key, no slot-blob rewrite. Hand-added participants remain slug-keyed and render as
  plain text per the ruled caveat (F-DM-19).
- **Rationale:** (b)'s blob-rewriting migration — the riskiest in the plan — buys nothing
  R-DM-2 doesn't already deliver for the resolvable population. Known residual: two
  hand-added same-named participants still collide; accepted under the plain-text caveat.
- **Resolves:** F-DM-04, F-DM-14, F-DM-15.
- **Unblocks/gates:** P6 (blocked-by P4).
- **Status:** ruled

### R-DM-4 — Is a doubles pair a first-class entity
- **Ruling:** Option (a). No new table: the commit seam emits `type="TEAM"` with real
  `member_ids` for a pair whose both halves are confirmed; `partnerEntryId` reaches the
  operator wire; one `isDoubles` authority. The director's manual pairing path **stays**
  for half-accepted and hand-added pairs — software flags, operators decide (I4).
- **Rationale:** Kyle raised the incumbent model (name matching + TD manual fix); explored
  and resolved: incumbents name-match because their intake has no key — ours does
  (`partner_entry_id`, written on both halves at acceptance). (a) is the incumbent's
  safety net without its name matching, the same "auto-link what is certain, flag the
  rest" shape as the 2026-08-23 minting ruling. Name-matching-as-primary would contradict
  that ruling and was not chosen.
- **Resolves:** F-DM-03, F-DM-07, F-DM-12, F-DM-13, F-DM-35, F-DM-36.
- **Unblocks/gates:** P5 (with P2).
- **Status:** ruled

### R-DM-4.x — Pull-forward: pair destruction at the commit seam (mini-ruling)
- **Ruling:** **Not pulled forward.** P5 lands in program order, after P2 gives
  `member_ids` a versioned home.
- **Rationale:** Unlike the P3 fork, this defect is loud — the director sees the lost
  pair on opening the draw and has a manual recovery path. Pulling P5 alone would write
  new structured data into unversioned blobs against Appendix A §3; pulling P2+P5 is an
  M+L early slice the urgency doesn't justify.
- **Resolves:** timing only.
- **Status:** ruled

### R-DM-8 — Blob-versioning shape
- **Ruling:** Option (a). A `v` int inside each blob, absent ⇒ v1, stamped on next write;
  one read/write helper per blob column at the repository boundary. `tournaments.data`'s
  three schemes reconcile per the plan's sub-answer: `state_version` untouched (I8
  concurrency token, not a schema version), `data["version"]` = schema version,
  `schema_version` documented as row-format version, one accessor.
- **Rationale:** Lazy versioning with no migration/backfill fits a single-store product
  where every reader is first-party; (b)'s all-at-once reader rewrite is the big-bang the
  strangler approach avoids.
- **Resolves:** F-DM-06, F-DM-39, F-DM-53.
- **Unblocks/gates:** P2, which blocks P4, P5, P7.
- **Status:** ruled

### R-DM-3 — PlayerProfile v1 scope (owner-supply / R15)
- **Ruling:** Option (c). **Full PlayerProfile v1 — a global person above
  `TournamentPlayer` plus public cross-tournament history pages — is the committed scope
  for P8.** Execution is **blocked until Kyle supplies the R15 content definition** (what
  a profile contains and shows, who claims it, opt-in posture); nothing is inferred
  meanwhile. R15 remains unwritten as of this session — Kyle explicitly declined to
  dictate it here.
- **Rationale:** Kyle wants the full destination committed, not just the storage option;
  the owner-supply discipline holds — an implementing agent may not invent profile
  content.
- **Resolves:** F-DM-17 and F-DM-18's cross-surface half (once executed).
- **Unblocks/gates:** P8's *scope* is settled; P8's *start* gates on (1) the R15 text,
  (2) P3+P4 per plan sequencing.
- **Status:** ruled — with an execution blocker (R15 text, owner-supply)
- **Note (open question):** With full v1, every unmerged identity fragment becomes a
  public profile URL a later merge must redirect — does the operator merge tool
  (`debt-log.md:78`, ruled deferral) need to ship with or before P8? Unresolved; flagged
  for the implementation-prompt author. Facilitator dissent recorded: (a)-until-R15-exists
  was my read; Kyle chose to commit the destination now.

### R-DM-5 — D8/F-E1: division-level mapping or seam-side slot assignment
- **Ruling:** (a) as the model, (c) as the mechanism. Entry events map onto a **division**
  (MS), never a slot (MS1); slot assignment is an **operator-side** action on a surface P7
  builds, alongside a real Meet Event entity that makes the mapping storable and retires
  the invented `groupId`.
- **Rationale:** Matches the entries spec's own ruling text
  (`2026-08-06-entries-design.md:1721-1729`); seam-side assignment would put a
  consequential competition decision inside intake, against I4's spirit. Compatible
  refinement of R2 (what a rank code names), not a supersession.
- **Resolves:** F-DM-23, F-DM-08 (in part), F-DM-24's Meet half. Closes debt-log D8's
  decision (build is P7's).
- **Unblocks/gates:** P7's Meet half.
- **Status:** ruled

### R-DM-6 — D7's open half: account deletion shape
- **Ruling:** Option (a). Account deletion is an **account-level scrub over the existing
  erase seam**: iterate the account's `entry_players`, scrub each
  (`entries/lifecycle.erase_player`), then neutralize the account row. No row deletion,
  no FK change; the scrubbed account is a documented terminal state.
- **Rationale:** The 2026-08-21 D7 ruling's own shape ("scrub the PII, keep the rows")
  applied one level up; the deliberate CASCADE stays unreached and unweakened; (b)
  remains available later.
- **Resolves:** debt-log D7's open (Phase-10) half. Interacts with L1's operator half and
  P2's blob-PII note (recorded there, not fixed here).
- **Unblocks/gates:** the Phase-10 account-deletion build (outside this program's phases).
- **Status:** ruled

*(R-DM-9..13 were presented as a batch per the session protocol; Kyle accepted all five
as recommended, with R-DM-11's live-surface consequence and R-DM-12's re-derivation
check stated explicitly before acceptance.)*

### R-DM-9 — `dto.generated.ts`: oracle or corpse
- **Ruling:** Option (a). Wire `dto.generated.ts` as a parity oracle — a test asserting
  `api/dto.ts` matches the generated shapes, with the known divergences allow-listed and
  ratcheted to zero, never silenced. Option (c) (import it directly, delete the hand
  mirror) is the eventual end-state once divergences reach zero.
- **Rationale:** Turns 8.6k dead lines into the missing mechanism behind F-DM-28/29;
  deleting instead would leave the hand mirrors — where the real drift lives — unpoliced.
- **Resolves:** F-DM-27, F-DM-28a, F-DM-28b, F-DM-29, F-DM-49.
- **Unblocks/gates:** P0 (which unblocks P1, P3, P6, P7).
- **Status:** ruled

### R-DM-10 — Which record answers "what engine is this workspace"
- **Ruling:** Option (a). `tournaments.kind` is the single domain authority, with a CHECK
  constraint; `workspace_modules` governs UI enablement only. Hybrid workspaces are
  foreclosed.
- **Rationale:** Nothing needs a hybrid workspace today and DV-7 is what every trace
  assumes; `_board_kind`'s "hybrid" answer becomes a UI-only notion.
- **Resolves:** F-DM-34; carries F-DM-37's CHECK work.
- **Unblocks/gates:** P7's discriminator half.
- **Status:** ruled

### R-DM-11 — Public tier event key: stable key or code
- **Ruling:** Option (b) now: `eventCode` stays the public key and **renaming a published
  event code becomes impossible** (a constraint, not a redesign). Option (a) — re-key
  public projections by a stable key with `eventCode` demoted to a label — only if and
  when P7 gives Meet a real Event.
- **Rationale:** A rename already silently orphans public URLs today; (b) turns silent
  breakage into a refusal for one line of constraint, versus a two-tier re-key (120
  files) plus a redirect story. `entry_events.bracket_event_id` stays FK-less per R2 —
  untouched.
- **Resolves:** F-DM-24, F-DM-57.
- **Unblocks/gates:** P7's wire half (softens its scope).
- **Status:** ruled
- **Note:** Live-surface consequence stated and accepted: directors can no longer rename
  an event code once published.

### R-DM-12 — Accept the §2.1 build-or-defer call
- **Ruling:** Option (a), accepted. Five of SP-P7's seven inherited deferrals build now
  (live-state chips, connector lines, plate winners, withdrawn/rejected write paths,
  newer-contact-details hint); **highlight-player** and **global profiles** defer past
  P3+P4.
- **Rationale:** Re-derived against this session's rulings before acceptance: R-DM-1/2
  landed as the table assumed; R-DM-3's upgrade to full v1 stays blocked and late, so the
  profile-deferral row holds; R-DM-1.x's P3 pull-forward makes the two deferred items
  available sooner without changing the call.
- **Resolves:** the Appendix A §3 sequencing requirement.
- **Status:** ruled

### R-DM-13 — Is Season/Calendar an entity
- **Ruling:** Option (a). Projection-only; `entry_pages.is_open` + dates remain the gate.
  No `seasons` table.
- **Rationale:** YAGNI — no consumer asks for it; SP-P8's key-set test already guards the
  payload. Forecloses nothing.
- **Resolves:** nothing open; forecloses nothing.
- **Status:** ruled

---

## Session-end summary

**Counts:** 15 recorded — the 13 `R-DM` decisions plus 2 pull-forward mini-rulings.
**15 ruled · 0 deferred · 0 parked.** One ruling (R-DM-3) carries an execution blocker.
No standing ruling (R1–R14, ADRs, D7, I4, the 2026-08-23 minting rule) was superseded;
every decision was ruled inside its constraints.

**Where the session went beyond the plan's recommendations:**
- **R-DM-2** strengthened: option (c) (Meet roster out of the blob) is a *ratified
  committed end-state*, not conditional.
- **R-DM-3** exceeded: full profile v1 (option c) rather than storage-only (b) — with
  execution blocked on the R15 content definition. Facilitator dissent recorded in place.

**Pull-forward outcomes:**
- **P3 (identity-minting gaps): PULLED FORWARD** — ships as a standalone slice before the
  program (R-DM-1.x). It is the first implementable work item.
- **P5 (pair survives intake): NOT pulled forward** — waits for P2 in program order
  (R-DM-4.x).

**Open questions for follow-up:**
1. **The R15 content definition** — owner-supply, still unwritten. Blocks P8's start
   (not its scope, which is ruled).
2. **Does the operator merge tool ship with or before P8?** With full profile v1, every
   unmerged identity fragment becomes a public profile URL a later merge must redirect.
   The debt-log deferral (`debt-log.md:78`) stands for now; the implementation-prompt
   author must surface this.

**Unblocked phases, recommended execution order:**
1. **P3** — pulled forward, standalone, first (needs only R-DM-1, ruled).
2. **P0** — type mechanism (R-DM-9 ruled); unblocks everything above the API.
3. **P1** — standings (after P0).
4. **P2** — blob versioning (R-DM-8 ruled); unblocks P4/P5/P7.
5. **P4** — people→competition key (R-DM-2 ruled; after P3+P2).
6. **P5** — pair survives intake (R-DM-4 ruled; after P2).
7. **P6** — bracket person key (R-DM-7 ruled; after P4).
8. **P7** — event key + Meet Event (R-DM-5/10/11 ruled; after P0; program-scale).
9. **P9** — cosmetic sweep, anytime after P0 (Boy-Scout material, not a program).
10. **P8** — PlayerProfile full v1 (R-DM-3 ruled) — **last, and gated on the R15 text.**
11. Beyond the ten phases: the R-DM-2(c) Meet-roster extraction program (after P4) and
    the Phase-10 account scrub (R-DM-6) are committed follow-on work.

The implementation prompt for the unification program is a separate future artifact
written against this register.
