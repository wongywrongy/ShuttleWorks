# ShuttleWorks Deployment Guide — RETIRED

> **This file is a tombstone. The guide it held was removed on 2026-08-06.**
>
> The path is kept because roughly thirty historical documents cite it
> (`docs/changes/`, `docs/audits/`, `.superpowers/sdd/`), and a dangling
> reference in a dated record is worse than a marker that explains itself.

## What was here

A deployment runbook, last substantively updated 2026-08-03, describing a
topology of three surfaces: a **Tauri sidecar** on the director's laptop, a
**Supabase project** holding a cloud Postgres mirror fed by the `sync_queue`
outbox, and a **Vercel-hosted** public TV display.

## Why it was removed rather than re-banner'd

**None of those three surfaces ever existed.** This was an abandoned plan
formatted as instructions, which is the most dangerous shape a stale document
can take — it reads as a description of a working system.

- **Tauri** was never scaffolded. No `src-tauri/`, no `@tauri-apps/cli`, no
  Rust toolchain, no build script. The guide admitted this in its "future work"
  section and then, ninety lines later, opened its smoke test with
  `npm run tauri dev` — a command it had already stated would fail.
- **Vercel** — no `vercel.json` has ever existed in this repo.
- **The Supabase mirror** was never operated. It accumulated 827 `sync_queue`
  rows and pushed **none of them, ever**: the drain thread only started when
  `SUPABASE_URL` and `SUPABASE_ANON_KEY` were both set, and both were blank
  everywhere. Removed entirely in SP-CLOUD-3.

It carried a `DO NOT FOLLOW` banner from 2026-08-04, which was necessary but not
sufficient: `README.md`'s opening paragraph still linked here as "deploy doc",
and `architecture/quality-attributes.md` cited this file for a claim
("no tunnel automation in the repo") that the self-host stack had already
falsified. A banner does not travel with an inbound link.

## Where the record actually lives

The decisions are recorded properly elsewhere — this file was a runbook, and a
superseded runbook is not a record of anything:

- [ADR 0003 — SQLite as primary persistence](../decisions/0003-sqlite-as-primary-persistence.md)
  — the local-first decision, with its mirror clause marked superseded
- [ADR 0012 — Remove the Supabase mirror](../decisions/0012-remove-the-supabase-mirror.md)
  — why it went, and the evidence it was never operated
- `docs/audits/10-mirror-removal-inventory.md` — the full removal inventory
- `docs/changes/2026-05-13.md` — the arc that produced the original guide

The full original text is in version control:
`git log --follow -p -- docs/deploy/cloud.md`.

## The current deployment story

- [Deploy: start to finish](../how-to/deploy.md) — one linear path, bare host to verified
- [Install: local](../how-to/install-local.md) — offline, single machine, no accounts
- [Install: self-hosted](../how-to/install-selfhost.md) — Postgres + Cloudflare Tunnel
- [Add a worker](../how-to/add-a-worker.md) · [Operations](../how-to/operations.md)
