# PRODUCT

## What it is

A single-day inter-school tournament scheduler — primarily badminton, adjacent racquet sports — built on a CP-SAT optimiser. It handles a tournament-day operator workflow end to end: roster authoring, match construction, schedule optimisation with live solver progress, drag-to-reschedule Gantt, real-time match operations (call to court, score, traffic-light status), director-tier disruption tools (delay start, insert break, close court), and a brand-facing public TV display for the venue.

It is **not** a SaaS marketing tool, not a generic scheduling library, not a sports-management CRM. It is the actual day-of-tournament cockpit for the person running the room.

## Register

`product` — the design serves the work. The exception is `/display` (the public TV view), which is `brand` — that surface is what the audience and players see, and it carries all the brand expression.

## Users

**Primary — Operator / Tournament Director.** A coach, parent volunteer, or league official running a 50-200-player one-day meet from a laptop wedged on a folding table at the corner of a gym. Mid-30s to 60s. Domain-fluent (knows badminton ranks, knows what a court closure means), software-tolerant but not software-native. Wants the schedule to *just work*, with one-click recovery when reality diverges (no-shows, court breakage, match overruns).

Glances at the screen between phone calls and walking matches to courts. **Cognitive load is the enemy.** They are not exploring; they are reacting.

**Secondary — Audience / Players.** Watching `/display` from a venue TV or projector, 6–20 metres away. They need to know which match is on which court, and (for players) when their next match is being called. No interaction.

**Tertiary — Reviewer.** Looking at a saved schedule after the day, comparing alternatives, debugging a constraint conflict.

## Tone

Operator surfaces: **calm, technical, dense, trustworthy.** The aesthetic of a well-engineered tool — Linear, Vercel dashboards, OR-Tools' own academic precision. Not playful. Not friendly. Not loud. But not sterile either: the solver theatre (scan-sweep, marching-ants, phase-glow, sheen) is intentional — it makes a long compute feel alive, and it tells the operator *the machine is doing real work*.

TV surface: **legible, theatre-grade, present.** Visible across a room. The brand expression lives here. Tighter typography, gentle motion, more presence than the operator UI.

## Brand

There is no consumer-facing brand to defer to — this is a one-person/one-school tool, internally branded as "ShuttleWorks" (boxed wordmark in the TabBar). The brand we are *constructing* through the design language:

- Quiet authority. The tool is more capable than it advertises.
- Solver-aware. Math is happening. The UI is honest about it (live HUD, gap, objective).
- Domain-specific. This is not a calendar app — every label, every status, knows it is talking about court-time and racquet sports.

## Anti-references

The skill's job is to keep us off these aesthetic lanes:

- **SaaS dashboard cream + purple gradient.** "AI tool" energy. We are not Notion-clone-meets-OpenAI.
- **Generic admin / shadcn-default look.** Borders, shadows, rounded-md cards everywhere with no commitment.
- **Bento-grid marketing maximalism.** No infinite-loop perpetual motion in the operator UI; that is hostile to focus.
- **Fitness-tracker primary colours.** No traffic-light reds and greens shouting at each other.
- **Glassmorphism by reflex.** Frosted panels are reserved for the TV header (where they signal "this is the chrome layer over a live feed"), not sprinkled across forms.

## Strategic principles

1. **Cockpit over canvas.** Operator screens are dense by design. Spacing serves grouping, not decoration. Cards are reserved for genuine elevation; most surfaces use `divide-y` / `border-t` / negative space.
2. **The solver is a first-class actor.** The HUD, scanline, phase-glow, marching-ants pin marker — all communicate state of the optimisation. They're not theatre for theatre; they signal *the machine is searching, you can wait or override*.
3. **Mono for numbers, sans for people.** Every digit is `tabular-nums`. Every player name is humanist. The grid layout collapses cleanly without jitter as the solver finds new solutions.
4. **Status colour is semantic, not decorative.** 13 status tokens (live / called / started / blocked / warning / idle / done × bg) that map to one operator concept each. Don't recolour them for visual variety.
5. **The TV is allowed to be louder.** Bigger type, tighter tracking, mild ambient motion (block-in stagger, noise overlay). Operator UI does not get any of those.

## Success looks like

- An operator who has never seen the app finds the next action without reading docs.
- Numbers don't jitter when the solver streams a new solution.
- The TV reads from the back of a gym.
- Live ops feels controlled — every state change goes through the proposal pipeline, nothing silently mutates.
- The first impression is "this was built by someone who understood the problem", not "this is another React + shadcn admin".
