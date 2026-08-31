---
layout: home

hero:
  name: ShuttleWorks
  text: Tournament scheduling, as a control plane
  tagline: One workspace, five architectural modules — Entries, Meet, Bracket, Operations, Display — over a shared CP-SAT engine, plus an SSR-first public tier. This site is the architecture, the module contracts, and the data flow, written for a developer picking the codebase up cold.
  actions:
    - theme: brand
      text: What ShuttleWorks is
      link: /explanation/what-is-shuttleworks
    - theme: alt
      text: System overview
      link: /explanation/architecture/system-overview
    - theme: alt
      text: Module contracts
      link: /reference/contracts/

features:
  - title: Workspace control plane
    details: The Hub lists your workspaces; each workspace enables modules. A UniFi-style control plane, not a stack of separate apps. Start here for the mental model.
    link: /explanation/architecture/workspace-model
  - title: Five architectural modules
    details: Entries is intake, Meet and Bracket are the engines, Operations is the live-ops layer, Display is the read-only output. Four are user-enableable; Operations is a Tier-2 architectural module.
    link: /explanation/architecture/system-overview
  - title: An SSR-first public tier
    details: The site where a player finds a tournament and enters it is a separate server-rendered app under /e/. Complete HTML and native writes work without hydration; bounded same-origin route modules enhance search, draws, account state, and entry progress. Poster and discovery pages have a blocking 4 KB budget; the persistent entry journey has an 8 KB budget.
    link: /explanation/architecture/entrant-tier
  - title: Test-enforced module contracts
    details: The seams between modules are declared in a typed, test-enforced descriptor. Each contract page states what crosses the boundary, who owns it, and the clean interface.
    link: /reference/contracts/
  - title: SQLite is the source of truth
    details: The director's laptop holds the canonical state in SQLite, and nothing in the write path reaches the network. The tournament finishes whether or not the internet does.
    link: /explanation/architecture/data-flow
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
| See what remains open | [Debt log](/reference/debt-log) |

::: tip This site is the current record
Historical plans, audits, and dated change logs were distilled into these pages
and removed from HEAD. Git history retains their provenance without leaving
stale, competing documentation in the working tree.
:::
