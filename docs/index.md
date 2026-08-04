---
layout: home

hero:
  name: ShuttleWorks
  text: Tournament scheduling, as a control plane
  tagline: One workspace, four architectural modules — Meet, Bracket, Operations, Display — over a shared CP-SAT engine. This site is the architecture, the module contracts, and the data flow, written for a developer picking the codebase up cold.
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
  - title: Four architectural modules
    details: Meet and Bracket are the engines, Operations is the live-ops layer, Display is the read-only output. Three are user-enableable; Operations is a Tier-2 architectural module.
    link: /architecture/system-overview
  - title: Test-enforced module contracts
    details: The seams between modules are declared in a typed, test-enforced descriptor. Each contract page states what crosses the boundary, who owns it, and the clean interface.
    link: /contracts/
  - title: SQLite is the source of truth
    details: The director's laptop holds the canonical state in SQLite; Supabase is a mirror populated by a crash-safe outbox. The tournament finishes even if the cloud is down all day.
    link: /architecture/data-flow
---

## Where to start

| If you want to… | Read |
| --- | --- |
| Understand the product and its vocabulary | [What ShuttleWorks is](/getting-started/what-is-shuttleworks) |
| Run it on your machine | [Running locally](/getting-started/running-locally) |
| Know where code lives | [Repo layout](/getting-started/repo-layout) |
| See the module shape | [System overview](/architecture/system-overview) |
| Trace how data moves | [Data flow](/architecture/data-flow) |
| Understand a coupling seam | [Module contracts](/contracts/) |
| Find an endpoint | [API reference](/api/) |
| Know why a choice was made | [Decisions (ADRs)](/decisions/) |
| Look up a term | [Glossary](/glossary) |
| See a day play out | [Operational scenarios](/architecture/operational-scenarios) |

::: tip This site is curated, not exhaustive
The full design record — per-slice specs, dated change logs, audits, and the historical
backend-merge roadmap — lives on disk under `docs/superpowers/`, `docs/changes/`,
`docs/audits/`, and `docs/architectural-roadmap.md`. Those trees are intentionally **excluded**
from this site (they carry GitHub-relative links and implementation scratch). Useful prose from
them has been consolidated into the pages here; the originals remain the archive.
:::
