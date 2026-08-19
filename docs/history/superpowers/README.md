# Historical design archive — NOT current truth

> **⚠️ SUPERSEDED / HISTORICAL.** Everything under `docs/superpowers/` is a
> point-in-time snapshot — dated plans, specs, progress logs, and the session
> handoff from the workspace-suite build-out (2026-05 … 2026-06). Each was an
> accurate record when written and is kept for historical / design-rationale
> reference **only**. It is **not** the current source of truth and may name
> files, paths, stores, routes, or architecture that have since changed (the
> SP-REFACTOR 1–6 program moved and deleted a lot of code afterward).

For **current** state, use these instead:

- **`REFACTOR_PROGRESS.md`** (repo root) — the live refactor ledger.
- **`docs/audits/06-state-of-codebase.md`** — the authoritative current snapshot.
- The **VitePress docs site** — `docs/architecture/`, `docs/modules/`,
  `docs/contracts/`, `docs/decisions/` — the living architecture reference.
- **`CLAUDE.md`** / **`CODE_HEALTH.md`** — working practices + guardrails.

This tree is excluded from the built docs site (`srcExclude` in
`docs/.vitepress/config.mts`), so it does not appear in the published IA. Do not
cite it as current in new work; if you find a claim here, verify it against the
code before relying on it.
