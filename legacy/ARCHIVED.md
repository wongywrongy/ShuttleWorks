# Archived — do not use, do not update

These three files are the pre-merge single-container deployment of the
scheduler, kept for reference only. Nothing builds, runs, tests, or
references them: `grep -rn "products/scheduler/legacy"` across the repo
returns nothing outside this directory.

They are **actively wrong** for the current product, which is why this
marker exists rather than just a stale directory:

- `requirements.txt` pins `ortools>=9.8.0`. The real backend pins an
  exact ortools version on purpose — determinism depends on it, and a
  floating minimum silently breaks reproducible solves (see
  `backend/requirements.txt` and the determinism rules in
  `CLOUD_PROGRESS.md`).
- `docker-compose.yml` declares the obsolete `version: '3.8'` key and
  knows nothing about Postgres, the solve-job worker, auth, or the
  cloud/local split.
- `Dockerfile` predates the workspace-root build context that the
  current images need to copy `packages/design-system`.

Use instead:

| Want | Use |
|---|---|
| Run locally | `make scheduler`, or `docs/how-to/install-local.md` |
| Deploy self-hosted | `docker-compose.selfhost.yml` + `docs/how-to/install-selfhost.md` |
| Add a worker host | `docker-compose.worker.yml` + `docs/how-to/add-a-worker.md` |

Kept in place rather than moved under `archive/`: that tree is frozen
(`CLAUDE.md`), so adding to it would itself be an edit. Safe to delete
outright if nobody has wanted it by 2027.
