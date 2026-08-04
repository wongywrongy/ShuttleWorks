---
name: shuttleworks-design
description: Use this skill to generate well-branded interfaces and assets for ShuttleWorks — the modular badminton tournament control-plane (Meet / Bracket / Operations / Display modules) — for production or throwaway prototypes/mocks. Contains the design language, color + type tokens, fonts, components, screen archetypes, and a UI kit.
user-invocable: true
---

Read `readme.md` in this skill first, then explore the token CSS (`styles.css` → `tokens/`), the components (`components/`), the archetype cards (`guidelines/`), and the UI kit (`ui_kits/scheduler/`).

Core language: dark-first "warmed-B blue-glow" — near-black substrate + ambient blue glow, luminous azure accent `#5B9DFF`, Geist type with tabular figures for all data, rounded corners + gentle elevation, muted-solid status chips. A light theme is available via `data-theme="light"` (the Public Display stays dark).

Golden rule — **modular means archetypal**: Meet and Bracket share page archetypes (Roster, Matches, Configuration, court board). Reuse the archetype and reskin the data; never redesign a shared page type per module.

If creating visual artifacts (mocks, slides, throwaway prototypes), link `styles.css`, use the token variables and the component primitives, and output static HTML for the user to view. If working on production code, copy the tokens/components and follow the rules here.

If invoked with no other guidance, ask what the user wants to build, ask a few scoping questions, then act as an expert ShuttleWorks designer outputting HTML artifacts or production code as needed.
