---
layout: home

hero:
  name: ShuttleWorks
  text: Tournament scheduling, as a control plane
  tagline: One workspace, five architectural modules — Entries, Meet, Bracket, Operations, Display — over a shared CP-SAT engine, plus a zero-JavaScript public tier. This site is the architecture, the module contracts, and the data flow, written for a developer picking the codebase up cold.
  actions:
    - theme: brand
      text: What ShuttleWorks is
      link: /getting-started/what-is-shuttleworks
    - theme: alt
      text: System overview
      link: /architecture/system-overview
    - theme: alt
      text: Module contracts
      link: /contracts/

features:
  - title: Workspace control plane
    details: The Hub lists your workspaces; each workspace enables modules. A UniFi-style control plane, not a stack of separate apps. Start here for the mental model.
    link: /architecture/workspace-model
  - title: Five architectural modules
    details: Entries is intake, Meet and Bracket are the engines, Operations is the live-ops layer, Display is the read-only output. Four are user-enableable; Operations is a Tier-2 architectural module.
    link: /architecture/system-overview
  - title: A public tier with zero client JavaScript
    details: The site where a player finds a tournament and enters it is a separate server-rendered app under /e/, held to a blocking 4 KB page-weight budget. Every interaction is native HTML.
    link: /architecture/entrant-tier
  - title: Test-enforced module contracts
    details: The seams between modules are declared in a typed, test-enforced descriptor. Each contract page states what crosses the boundary, who owns it, and the clean interface.
    link: /contracts/
  - title: SQLite is the source of truth
    details: The director's laptop holds the canonical state in SQLite, and nothing in the write path reaches the network. The tournament finishes whether or not the internet does.
    link: /architecture/data-flow
---

## Where to start

| If you want to… | Read |
| --- | --- |
| Understand the product and its vocabulary | [What ShuttleWorks is](/explanation/what-is-shuttleworks) |
| Run it on your machine | [Running locally](/how-to/running-locally) |
| Know where code lives | [Repo layout](/reference/repo-layout) |
| See the module shape | [System overview](/explanation/architecture/system-overview) |
| Trace how data moves | [Data flow](/explanation/architecture/data-flow) |
| Understand a coupling seam | [Module contracts](/reference/contracts/) |
| Find an endpoint | [API reference](/reference/api/) |
| Know why a choice was made | [Decisions (ADRs)](/explanation/decisions/) |
| Look up a term | [Glossary](/reference/glossary) |
| See a day play out | [Operational scenarios](/explanation/architecture/operational-scenarios) |
| See what has been built, and when | Program ledgers in `docs/history/programs/` (repo working records, outside this site) |

::: tip This site is curated, not exhaustive
The full design record — per-slice specs, dated change logs, audits, and the historical
backend-merge roadmap — lives on disk under `docs/history/` (`superpowers/`, `changes/`,
`audits/`, `architectural-roadmap.md`). Those trees are intentionally **excluded**
from this site (they carry GitHub-relative links and implementation scratch). Useful prose from
them has been consolidated into the pages here; the originals remain the archive.
:::
