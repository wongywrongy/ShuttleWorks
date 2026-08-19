# Extending ShuttleWorks

Action-oriented guides for adding to the codebase. Each one gets you from A to B
against the **real** extension points — the same files Meet, Bracket, Operations,
and Display are built from — and ends with the command that proves it worked.

If you're learning the architecture rather than changing it, start with
[System overview](/explanation/architecture/system-overview) and [Module
contracts](/reference/contracts/) instead.

## The guides

| Guide | Use it to… |
|---|---|
| [Add a module](/how-to/add-a-module) | Stand up a new enableable module end-to-end (the marquee — every other guide is a subset). |
| [Add a surface](/how-to/add-a-surface) | Add one new tab/segment to an existing module. |
| [Add an API endpoint](/how-to/add-an-api-endpoint) | Wire one route end-to-end with its DTO twin and hook. |
| [Add a CP-SAT constraint](/how-to/add-a-cpsat-constraint) | Teach the scheduling engine a new hard or soft rule. |
| [Wire a seam](/how-to/wire-a-seam) | Declare a typed cross-module edge and keep the contract honest. |
| [Enable a module](/how-to/enable-a-module) | Turn a module on/off per workspace, within the control-plane rules. |
| [Build on the engine](/how-to/build-on-the-engine) | Build your own product on the pure `scheduler_core` CP-SAT engine. |

## Deploying & operating

Running ShuttleWorks rather than extending it.

| Guide | Use it to… |
|---|---|
| [Install: local (offline)](/how-to/install-local) | Run the single-machine offline mode — a first-class product mode, not a dev shortcut. |
| [Install: self-hosted](/how-to/install-selfhost) | Stand up the multi-tenant deployment behind a Cloudflare Tunnel, on a fresh Ubuntu host. |
| [Add a worker machine](/how-to/add-a-worker) | Join a second machine as pure compute, under a least-privilege database role. |
| [Operations](/how-to/operations) | Upgrade, roll back, read the health endpoints, and set the two alerts that matter. |

## The throughline

A module is not a registry object — it's a set of **honest declarations** across
a handful of files, held to the running app by the test-enforced
[module contract](/reference/contracts/). Every guide here edits one or more of those
declarations; the contract test is your proof the change is consistent.
