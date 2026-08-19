# Contributing

How work moves through this repository. `CODE_HEALTH.md` governs the *quality*
of a change; this file governs its *path* — branch, review, merge, release,
deploy.

---

## Trunk-based, with short-lived branches

`main` is the trunk. It is always deployable and it is what production tracks.

1. **Branch from `main`**, never from another feature branch. Stacking a branch
   on an unmerged branch is what produced the 2026-08-05 consolidation: three
   parallel `dev/*` lines where no one could say which was authoritative.
2. **Keep it short-lived** — days, not weeks. A branch that outlives the work
   it was cut for accumulates merge risk and becomes a second trunk.
3. **Merge via PR**, so the CI gate runs. Both required jobs (frontend and
   backend) must be green. `.github/workflows/ci.yml` is the gate; see the
   lean-gate philosophy in `CLAUDE.md` before tightening it.
4. **Delete the branch on merge**, local and remote. A merged label that
   lingers is indistinguishable from active work at a glance.

### Naming

`<type>/<short-slug>` — `fix/lease-heartbeat-guard`, `feat/swiss-standings`,
`docs/deploy-runbook`. The type prefix is the same vocabulary as the commit
subjects (`feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`).

Avoid `dev/*`. It says nothing about the work and it is the naming that grew
the long-lived stacks.

---

## Releases are tags, not branches

When `main` reaches a state worth deploying, tag it:

```bash
git tag -a v0.2.0 -m "<what changed>"
git push origin v0.2.0
```

Tags are immutable and a branch label is not. That difference is the whole
point: a deployment pinned to `v0.2.0` is running a known tree, while a
deployment pinned to `dev/whatever` is running whatever that label pointed at
the last time someone pulled.

`.github/workflows/publish-release.yml` builds and pushes GHCR images on every
`v*.*.*` tag and on every push to `main`.

---

## The deployment tracks a tag or `main` — never a feature branch

This is the rule the consolidation existed to restore. Production (`cayde`,
`/opt/ShuttleWorks`) was found checked out to an unmerged `dev/review-fixes`:
CI-green and correct, but a label that could move or be deleted underneath a
live event, and a hotfix would have had to reason about which of five branches
was authoritative.

To move the deployment:

```bash
cd /opt/ShuttleWorks
git fetch --all --tags
git checkout v0.2.0          # or: git checkout main && git pull --ff-only
docker compose -f docker-compose.selfhost.yml up -d --build
```

Then verify through the real ingress path — the frontend publishes no host
port, so `localhost` on the host answers nothing; cloudflared is the only way
in. From inside the network, and **over IPv4**, because `localhost` resolves to
`::1` in the container while nginx binds IPv4:

```bash
docker compose -f docker-compose.selfhost.yml exec -T frontend \
  wget -qO- http://127.0.0.1:8080/api/health
```

Expected: `/api/health` → 200, `/api/health/metrics` → 403 (ops-token gated),
`/` → 200.

---

## Branch hygiene

Check periodically, and always after a merge:

```bash
git fetch --prune
git branch --merged main            # local labels safe to delete
git branch -r --merged main         # remote labels safe to delete
git cherry -v main <branch>         # commits NOT in main; empty = fully merged
```

`git cherry` is the proof, because it compares patch content and so catches
commits that reached `main` under a different SHA via rebase or squash. "Looks
merged," an old date, or a `0 ahead` reading in the GitHub UI are not proof —
that UI reading was misread as `10 ahead` during the audit when the branch was
in fact 10 *behind* and fully contained.

**Record the tip SHA before deleting.** A deleted branch is recoverable only if
you have it:

```bash
git rev-parse <branch>              # write it into the ledger, then delete
```

Never force-push `main`, and never rewrite shared history. Consolidation is
merges and label deletions.

---

## Work in progress that isn't ready to merge

A branch holding a deliberately-failing test — a committed reproduction of a
bug not yet fixed — is a legitimate long-lived exception. It must **not** be
merged (it would red the trunk), but it must be **pushed**, so the reproduction
is not one disk failure from gone. `dev/cloud-concurrency` is the current
example: an SP-CLOUD-4 Phase 0 audit plus a test reproducing a lost update on
`PUT /state`.
