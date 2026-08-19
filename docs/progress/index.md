# Progress reports

What has actually been built, program by program. Every substantial change to ShuttleWorks runs
as a **named program** with a ledger that is read at session start and updated at session end.
This page is the curated board over those ledgers: what each program delivered, when it closed,
and what it left open.

::: info Where the full record lives
The ledgers themselves are working records — dated, long, and full of implementation detail. They
stay on disk under `docs/programs/` and are deliberately excluded from this site. Each row below
names its ledger file. For the current state of the codebase as a whole, read
`docs/audits/08-state-of-codebase.md`; for open, accepted debt, `docs/audits/debt-log.md`.
:::

## The board

| Program | Delivered | Status | Ledger |
| --- | --- | --- | --- |
| **SP-REFACTOR** | Debt paydown across 7 phases, then the standing code-health discipline (`CODE_HEALTH.md` + the debt log) that normal feature work now runs under. Both engine "locked" functions characterized and decomposed; 2 latent bugs found and fixed | **Complete** (2026-07-01) | `REFACTOR_PROGRESS.md` |
| **Frontend design migration** | The current design language: token remap, four keystone surfaces, light + dark verification against the prototypes, reusable archetypes | **Complete** | `FRONTEND_PROGRESS.md` |
| **SP-CLOUD-1** | The **async solve rail** — `POST …/solve-jobs`, a DB-backed queue, a killable worker subprocess with pinned determinism, and the embedded-or-container worker loop. The synchronous `POST /schedule` and its SSE stream now answer `410` | **Complete** (2026-08-03) | `CLOUD_PROGRESS.md` |
| **SP-CLOUD-2** | **Self-hosted identity and tenancy** — cookie sessions on Argon2id, orgs owning workspaces, `require_tournament_access` answering a uniform 404 to non-members, and Display's public **capability token** replacing raw workspace UUIDs | **Complete** (2026-08-03) | `CLOUD_PROGRESS.md` |
| **SP-CLOUD-3** | **Removed the Supabase mirror entirely** ([ADR 0012](/decisions/0012-remove-the-supabase-mirror)), plus the self-host deployment stack and the install docs walked literally end to end | **Complete** (2026-08-04) | `CLOUD_PROGRESS.md` |
| **SP-REPO-1** | Branch consolidation onto `main`; retired the `dev/*` convention for short-lived `<type>/<slug>` branches | **Complete** (2026-08-05) | `CLOUD_PROGRESS.md` |
| **SP-PERF-1** | Performance audit and dead-code removal | **Complete** (2026-08-05) | `CLOUD_PROGRESS.md` |
| **SP-SEC-1** | Security hardening to **OWASP ASVS 5.0** (L1 across the board, L2 for V1/V2/V6/V7/V8): input validation and mass assignment, output encoding on derived surfaces, abuse controls, headers and disclosure, verified against the real deployment | **Complete** (2026-08-05) | `SEC_PROGRESS.md` |
| **SP-SEC-2** | Standing security audit over the hardened tree | **Complete** (2026-08-06) | `SEC_PROGRESS.md` |
| **SP-CLOUD-4** | Lost-update concurrency on the shared state blob (`If-Match` / `state_version` fetch-modify-retry) | **Complete** (2026-08-06) | `CLOUD_PROGRESS.md` |
| **SP-PROGRAM-1** | **The public platform** — the Entries module and the entrant tier. See the report below | **In progress** (started 2026-08-06) | `ENTRIES_PROGRESS.md` |

## Reports

- [The public platform (SP-PROGRAM-1)](/progress/2026-08-public-platform) — the current program:
  what the [Entries module](/modules/entries) and the
  [entrant tier](/architecture/entrant-tier) do today, phase by phase, and what is still owed.

## How programs work

Every program follows the same protocol, and it is worth knowing if you are picking one up:

1. **Read the master plan, then the ledger, then recent commits.** Program state is never inferred
   from memory or from older docs; the tree and the ledger outrank every other document.
2. **One phase per session**, and a phase whose entry conditions are unmet is not started.
3. **STOP gates are hard.** Where the plan says STOP, work halts and reports. Gates marked
   `[USER SIGN-OFF]` need explicit approval recorded in the ledger before the next phase begins.
4. **Deviation is a STOP, not a judgment call.** If reality contradicts the plan, the contradiction
   is written down and reported rather than worked around.
5. **Docs update in the same commit as the code they describe.** That rule is why this site exists
   in the shape it does.

Verification is per phase and non-negotiable: frontend typecheck + full Vitest + production build,
backend full pytest, and a compose round-trip when compose files change. Test counts are
re-baselined once at program start and only go up after that.

## See also

- [System overview](/architecture/system-overview) — what the programs above have produced
- [Decisions (ADRs)](/decisions/) — the durable *why* behind the shape they left
- [Quality attributes](/architecture/quality-attributes) — the properties every program has to preserve
