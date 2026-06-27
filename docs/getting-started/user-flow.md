# User flow

Where the [system overview](/architecture/system-overview) describes the product's *structure*, this
page describes the *journey* — how people actually move through ShuttleWorks. There are two flows: the
**operator** running the event, and the **public viewer** watching it.

## The operator journey at a glance

```
 Sign in ──▶ Hub ──▶ Create / open ──▶ Workspace shell ──▶ Configure ──▶ Run the engine ──▶ Go live ──▶ Show it
            (list)    a workspace       (left nav + dock)   (venue +      (Meet or Bracket)   (Operations)  (Display)
                                                             modules)
```

Every step maps to a real surface in the workspace's left navigation:

| Phase | Where (nav) | Owning module |
| --- | --- | --- |
| Pick / create the event | Hub (`/`), New Workspace (`/new`) | Control plane |
| Orient | **Overview** | Workspace shell |
| Set up the venue | **Workspace → Venue & schedule**, **Modules** | Control plane |
| Author the competition | **Meet:** Roster · Matches · Configuration — or — **Bracket:** Roster · Draws · Matches · Configuration | Meet / Bracket |
| Run the day | **Operations → Courts · Live** | Operations |
| Show the room | **Display → Preview · Configuration**, public `/display` | Display |

## Step by step

### 1. Sign in and land on the Hub

Authenticated operators land on the **Hub** (`/`) — a dashboard of every workspace they can see. Each
card shows a live [signal](/api/signals): health (good / attention / draft / archived), what needs
attention, a setup-readiness checklist, the enabled modules, and collaboration counts. This is where an
operator decides *which event to work on* or *creates a new one*.

### 2. Create a workspace

From the Hub, **New Workspace** (`/new`) creates one event's control plane. You start from a template —
**Meet Day**, **Bracket Tournament**, **Hybrid**, or **Blank** — or a **custom** module mix. The
template seeds which [modules](/architecture/system-overview) start enabled (e.g. a Meet Day enables
Meet + Display; Bracket enables Bracket + Display). See the
[workspace model](/architecture/workspace-model) for how that seed is persisted.

### 3. Open the workspace — the shell

Opening a workspace drops you into the **workspace shell**: a stable chrome with workspace identity and
status, a **module dock** to switch between enabled modules, role/connection indicators, and the left
navigation. The default landing surface is **Overview** — the in-workspace echo of the Hub signal, so
the operator immediately sees what's done and what's missing.

### 4. Configure the venue and modules

Two setup surfaces, both under the **Workspace** admin block:

- **Venue & schedule** — courts, slot duration, and the day's start/end window. This is shared by both
  engines (it writes the same `config` the engines read), so you set it once.
- **Modules** — the module catalog: enable / disable Meet, Bracket, and Display. The control plane
  enforces the rules here: **Display can't be enabled without an operational engine**, a workspace keeps
  **at least one** of Meet/Bracket enabled, and a module **with data can't be disabled**. (Details:
  [workspace model](/architecture/workspace-model#server-enforced-transition-rules).)

### 5a. Author a Meet

The **Meet** engine's three surfaces, left to right:

1. **Roster** — add schools/groups and players (inline or bulk import).
2. **Matches** — the events each player will play.
3. **Configuration** — Meet-specific solver settings (the shared venue/day-window lives in *Venue &
   schedule*).

When the roster and matches are ready, the operator **generates the schedule** — the CP-SAT solver runs
with live SSE progress (phase / objective / gap) and offers a top-N candidate pool. The solved schedule
becomes the input to Operations. (This crossing is [Seam A](/contracts/meet-operations).)

### 5b. …or author a Bracket

The **Bracket** engine's surfaces:

1. **Roster** — participants (players or teams).
2. **Draws** — create events (disciplines), seed, and generate single-elimination or round-robin draws.
3. **Matches** — the generated bracket matches.
4. **Configuration** — bracket-specific settings.

The operator **schedules the next ready round** through the shared engine; the bracket snapshot feeds
Operations ([Seam B](/contracts/bracket-operations)). Recording a result **advances** the winner
(intra-bracket — no round-trip through Operations).

### 6. Run the day — Operations

On event day the operator lives in **Operations** (the [live-ops layer](/modules/operations)), which has
two surfaces pointed at whichever engine is active:

- **Courts** — the live court layout: which match is on which court, in which slot.
- **Live** — per-match status with a traffic-light state machine. The operator drives each match through
  `scheduled → called → playing → finished` (or `retired`); "playing" shows to operators as **started**.

The live flow is built for safety under pressure:

- **Optimistic commands** — call / start / finish / score apply instantly in the UI and flush through an
  idempotent command queue; conflicts surface inline (no modals).
- **Proposal → review → commit** — every disruptive change (re-plan, repair, a drag, a director action)
  is shown as a **proposal with a full impact diff before it commits**.
- **Advisories** — overruns, no-shows, running-behind, start-delay, and approaching-blackout each surface
  with a one-click action.
- **Suggestions inbox** — a background worker proposes better schedules; the operator applies one with a
  click.
- **Director time-axis tools** — delay the start, insert a break, close/reopen courts — all routed
  through the proposal pipeline.

### 7. Show the room — Display

**Display** turns the live state into the public view:

- **Configuration** — set up what the screen shows.
- **Preview** — the in-workspace preview of the TV view.
- The **public display** (`/display?tournament_id=…`) is opened on the venue screen — no login,
  dark-only, courts / schedule / standings modes. It reads live match state ([Seam D](/contracts/operations-display)).

### 8. Collaborate and protect the data

Throughout, the **Workspace** admin block supports the rest of the operation:

- **Members** & **Sharing** — invite assistant operators (collaborator invite links) or share the
  read-only public display link.
- **Sync and backups** — watch sync health and snapshot / restore the workspace state.

## The public viewer flow

Short and login-free:

```
Open /display?tournament_id=<id>  ──▶  live courts / schedule / standings, auto-refreshing
```

Assistant operators on the LAN get a richer, read-mostly view of the same live state and can submit
commands back to the director's machine. The director's laptop stays the source of truth; everyone else
reads a mirror. (See [data flow](/architecture/data-flow) and
[ADR 0003](/decisions/0003-sqlite-as-primary-persistence).)

## Where this maps in the docs

- The surfaces and ownership: [System overview](/architecture/system-overview) and the per-module pages
  ([Meet](/modules/meet) · [Bracket](/modules/bracket) · [Operations](/modules/operations) ·
  [Display](/modules/display) · [Settings](/modules/settings)).
- The data crossing each engine→ops→display hand-off: [Module contracts](/contracts/).
- What persists as you click: [State management](/architecture/state-management).
