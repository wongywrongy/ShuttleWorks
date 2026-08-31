# 0019 — Design-system consolidation pass (pre-designer handoff)

**Status:** Accepted — 2026-08-31

## Context

Before handing the UI to a professional designer (and mirroring it as a
Figma library), the frontend was audited for token drift, duplicated
styling, and implicit primitives. The audit found the foundation already
in place — `packages/design-system/` owns the tokens, preset, and shared
primitives, and both apps consume them with zero off-token palette
classes — but a tail of unfinished migrations, one real token bug, stale
documentation actively teaching forbidden patterns, and an unwired gate.

## Decision

A conservative consolidation pass, behavior- and visual-preserving,
recorded here. What changed:

- **Gates:** `check-classes.mjs` (unknown token-shaped utilities) was
  repointed at the post-reorg tree and wired into `package.json`
  (`test:classes`), `make check`, and CI. It immediately caught five
  shipping invisible-color bugs (`text-warning-ink`, `border-warning`,
  `bg-warning`, `bg-surface`), all fixed to their real tokens.
- **Token bug:** `apps/entrant/app/app.css` referenced the nonexistent
  `--rule-control` (three declarations); the public bracket connector
  borders had been painting `currentColor`. Fixed to `--border-control`.
- **Text-style ladder:** the console's most-copied className literals
  became named constants in `apps/console/src/lib/utils.ts`
  (`TEXT_MUTED_2XS/XS/SM`, `TEXT_TITLE`, `TEXT_TITLE_SM`,
  `TEXT_EMPHASIS`), adopted across the low-risk modules (hub, settings,
  workspace, entries, setup, publish).
- **Entrant vocabulary:** `apps/entrant/app/lib/ui.ts` now owns the card
  and control skins (`CARD`, `CARD_SKIN`, `INPUT_SKIN`, `SELECT_CONTROL`,
  `BUTTON_SECONDARY`) that were previously spelled inline (the card skin
  36 times across 18 files).
- **Promotions:** the bracket module's parallel input skin
  (`FIELD_INPUT_CLASSES`) moved to the shared layer as
  `INPUT_INLINE_CLASS`; a `DialogFooter` component (variants
  `between`/`end`) replaced nine hand-copied footer rows across four
  modules; the dead `Eyebrow.framed` prop was deleted.
- **Docs:** `apps/console/src/components/README.md` and
  `apps/console/FRONTEND.md` no longer prescribe the raw Tailwind status
  palette (forbidden since the token refactor) or claim tokens live in
  `index.css`. New reference pages: `docs/reference/design-system.md`,
  `docs/reference/surface-map.md`.

## Deferred by design (the interesting part)

These looked like consolidation targets and were deliberately left,
because closing them changes the design, not just the code. They are the
first questions for the designer:

1. **Card radius.** The shared `Card` is square by brand rule
   (`packages/design-system/BRAND.md`); the entrant tier's card is
   `rounded-lg shadow-sm`; console panels use `rounded-sm`. One card
   component needs one answer.
2. **Status pill register.** `StatusPill` (uppercase, `rounded-sm`) and
   the entrant `StatusChip` (sentence case, `rounded-full`) share a tone
   map and diverge in voice. Unifying them is a register decision, and
   `StatusChip`'s path is pinned by the entrant truncation guard.
3. **EmptyState.** Three components share the name and not the design
   (console centered zero-state; entrant card with link action; bracket
   editorial section). Promoting them into one primitive would have
   forced artificial variants; design one empty-state language first.
4. **TextField vs inline inputs.** The shared `TextField` always renders
   a visible label; the console's dense panels need unlabeled,
   aria-labelled inputs (`INPUT_INLINE_CLASS`). Whether every input gets
   a visible label is an accessibility/design call.
5. **Raw buttons in operations.** ~200 raw `<button>`s remain, mostly
   row/cell affordances in the conservative zone (Plan, Live day, score
   entry). Sweeping them onto `Button` risks the workflows the pass was
   told not to touch.
6. **PageShell.** The page-root flex litany (`flex h-full min-h-0
   flex-col` ×16) is uniform but unextracted; the shell contract test
   already pins it, so extraction is churn until something changes.

## Consequences

- Every visual value a designer needs is now reachable from two files
  (`packages/design-system/tokens.css`, `tailwind-preset.js`) and two
  constant tables (`apps/console/src/lib/utils.ts`,
  `apps/entrant/app/lib/ui.ts`).
- The invisible-color bug class is now gated in CI both ways (values by
  `test:contrast`, names by `test:classes`).
- The five token fixes and the `--border-control` fix are deliberate
  visual deltas (previously-transparent colors now render as intended);
  everything else in the pass is pixel-neutral against the surface books.
