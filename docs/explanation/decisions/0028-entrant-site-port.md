# 0028 — The entrant site takes the curated Claude Design mock

**Status:** Accepted — 2026-09-04. Extends ADR 0027 to the public tier;
supersedes the seven-tab tournament page described in SP-P7 §3.4–3.6 and the
Overview timeline (Z9). Written against ADR 0026's "mirror, then cut" premise:
this is the owner's cut, applied in one pass rather than item by item.

## Context

After the data and actions groups (ADR 0027) the owner drew the whole public
entrant tier in Claude Design (`ShuttleWorks Entrant Site.dc.html`, project
`57917b85`): thirteen screens from discovery to the player page, every value
resolving to a design-system token. It was drawn *from* the shipped tier, so
the anatomy already matched; what differed was the skin (segmented controls,
row cards, the display type role, a filled live header on match cards), three
product decisions, and one omission on our side: the public tier shipped no
webfont files at all, so every heading rendered in the system stack while the
console rendered Geist and Archivo.

## Decisions

1. **Four tabs on the tournament page: Overview · Schedule · Draws · Players.**
   Events folds into Draws — one row per event from the day the page exists,
   gaining the draw's facts, a Draw button and the champion as the organizer
   publishes them. Seeded entries and Winners stop being tabs: seeds already
   ride the draw page as `[n]`, the champion rides the Draws row from the
   draw index. Bookmarks naming `?tab=events|seeds|winners` land on Draws;
   `?tab=entrants` still lands on Players. The `/seeds` and `/winners` public
   projections keep serving; nothing on this tier reads them (debt D37).
2. **The public tier ships Geist, Archivo and JetBrains Mono** through
   `@fontsource-variable`, imported from `app.css`. The files are
   fingerprinted under `/e/assets/` on the same origin, so `font-src 'self'`
   admits them; CSS and fonts are outside the page-weight gate.
3. **Key dates are plain label/value rows.** The dotted timeline rail and its
   "You are here" marker go; the hero's status line already says which phase
   the tournament is in.
4. **The mock is not ported where a standing ruling says otherwise.** Its
   status pills and step numbers are fully round with a dot: they render as
   the rectangular `StatusChip` / `rounded-xs` chips and `rounded-xs` squares
   (ADR 0027). Its primary buttons glow: they are the design-system `Button`
   (hard 3px shadow, no glow). Its segmented controls clip with
   `overflow: hidden` and hold labels with `white-space: nowrap`, both banned
   on this tier: the end items carry the radius themselves. The screen
   switcher bar and the 1280px frame are canvas chrome.
5. **New shared vocabulary lives in `apps/entrant/app/lib/ui.ts`** —
   `LIST_CARD`/`LIST_CARD_ROW`, `PAGE_TITLE`/`SECTION_TITLE`, `EYEBROW`,
   `CHIP`, `FIELD_INPUT`/`FIELD_LABEL` — plus one component, `SegmentedNav`.
   The page-scoped scripts under `public/assets/` cannot import it, so their
   copies are pinned equal by `tests/uiTwins.test.ts`.

## Consequences

- `visibleTabs` returns at most `[overview, draws, players]`; the Draws panel
  reads the draw index only when draws are published (still one extra read
  per document, never a fan-out). `EventRow` gains `draw`/`drawHref`.
- Match cards share one anatomy on the schedule, player and draw pages; the
  visible winner tick is gone (weight + `sr-only` "Winner" carry it).
- The honours detail the Winners tab showed (runner-up, semifinalists, final
  score) has no public surface; the draw page's bracket carries the result.
  Logged as D38 with the retired projections.
- Class-token assertions in the entrant tests were re-pinned deliberately
  (`components`, `tournament.render`, `draw.render`, `discovery.render`,
  `player.render`, `phase`); behaviour assertions changed only where decision 1
  changed behaviour.
- Remaining Claude Design groups (forms, feedback, layout, navigation) still
  port one specimen card at a time, per ADR 0027.
