# 0020 — Design-language resolutions

**Status:** Accepted — 2026-08-31. Supersedes deferral items 1–3 (and the
dialog subset of item 5) of ADR 0019.

## Context

ADR 0019 recorded six design-language divergences the consolidation pass
deliberately left open because closing them required a design decision,
not a refactor. The owner (who is also building the Figma library) has
now ruled on four; each ruling was chosen to be pixel-neutral so the
system gains one source of truth without a visual migration.

## Decisions

1. **Card radius is per-tier, by decision.** The operator console is
   sharp (`rounded-sm` on panels — `PANEL_RADIUS` in
   `apps/console/src/lib/utils.ts`); the public entrant tier is soft
   (`rounded-lg` — `CARD` in `apps/entrant/app/lib/ui.ts`); the shared
   `Card` stays square per `packages/design-system/BRAND.md`. In Figma
   these are two card components, not one with a wrong radius on one
   tier. Adoption of `PANEL_RADIUS` is opportunistic; no sweep.

2. **Status badges draw one tone palette in two registers.**
   `packages/design-system/components/statusTone.ts` (`STATUS_TONE`) is
   the single tone→class source. `StatusPill` (operator register:
   uppercase micro-label, `rounded-sm`) and the entrant `StatusChip`
   (public register: sentence case, `rounded-full`) both compose from it
   — per-part, in each register's historical order, so rendered strings
   are byte-identical to before and drift is now impossible.

3. **EmptyState is one component with three explicit variants.**
   `packages/design-system/components/EmptyState.tsx` renders
   `centered` (console zero-state), `card` (public empty result), and
   `editorial` (bracket placeholder) — each byte-for-byte the markup its
   tier previously inlined. The three prior components remain as thin
   wrappers preserving their prop APIs. One Figma component, three
   variants. The `pageContainerContract` allowlist entry for
   `BracketEmptyState.tsx` was removed (its centred block now lives in
   the design system, outside that scan's surface set — the list only
   shortens).

4. **Ops dialog primaries use `Button`; the rest stay raw by ruling.**
   The six accent primaries (Commit/Preview in WarmRestart, MoveMatch,
   Disruption dialogs) became `Button variant="default" size="sm"` with
   a 3-token override (`h-auto py-1.5 font-normal`). Known micro-deltas,
   accepted: transition 150ms vs the raw 120ms; disabled state
   `opacity-50` + `pointer-events-none` vs `opacity-60` + not-allowed
   cursor. Left raw, each annotated in place:
   - dialog cancel/close buttons — `variant="outline"` differs in border
     token, fill, and hover (≥7 overrides = fighting the component);
   - `DirectorToolsPanel`'s ink-fill `bg-primary` primaries — no Button
     variant renders an ink fill (default is accent+glow); this is the
     one genuinely divergent primary-action skin in the product;
   - selection chips/pills in the dialogs — `ActiveChoice` territory,
     not buttons.

## Open questions for the design pass (carried forward)

- Should dialog cancels become `Button variant="outline"` (a visible
  border/fill change)?
- Should the ink-fill primary be promoted to a Button variant or retired?
- Still deferred from ADR 0019: PageShell extraction; visible labels vs
  `INPUT_INLINE_CLASS`; raw buttons outside the four dialogs.

## Consequences

- Tone palette, eyebrow type step (`EYEBROW_CLASS`, now defined in
  `packages/design-system/components/textStyles.ts` and re-exported to
  the console), and empty-state language each have exactly one
  definition, all inside the design system — the Figma library maps to
  one place.
- Rendered HTML is unchanged everywhere except the six dialog primaries'
  micro-deltas above.
