# Ledger — package 28 (small consistency and brand-seam cleanup)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

Package 28 is P2 polish scoped to separators, icon choice, casing, border tokens, and brand-seam
ownership — no copy-meaning changes. Almost all of this package's changes are class-token or
test-only; exactly one rendered glyph changed value (a separator character), listed below.

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `ScheduleDiffView.tsx:278` `summaryParts.join(...)` | Operations → Plan → schedule-diff summary line | any | `summaryParts.join(' • ')` (bullet) | change | `summaryParts.join(INLINE_METADATA_SEPARATOR)` — the middot (" · ") already used by every other inline-metadata join in the product | Plan §3 X9/ruling 1: one separator per context, middot for inline metadata; verified no other console/entrant file used a bullet as an inline separator (`git grep "•"` across the scoped surfaces — the remaining hits are doc-comment bullet lists or the password-mask placeholder, not separators) | X9 → 28 (plan §7 cross-cutting routing) | `apps/console/src/modules/operations/plan/ScheduleDiffView.tsx`; `apps/console/src/lib/utils.ts` (`INLINE_METADATA_SEPARATOR` definition); `apps/console/src/platform/contracts/__tests__/separatorContract.test.ts` |

## Notes

- No page title, nav item, or section heading required a casing change: `workspaceNav.ts`'s
  `buildWorkflowNavigation`/`buildWorkspaceNav` labels and `MODULE_LABELS` were already sentence
  case with the plan's product-noun exceptions (Meet, Bracket, Operations, Display, Setup), and
  the entrant `TabBar.tsx` `TAB_LABELS` (Overview / Schedule / Draws / Players) were already
  single-word sentence case. Pinned by `navCasingContract.test.ts` rather than changed.
- The generic (Phosphor) icon set was already one-icon-per-concept across the scoped surfaces —
  no duplicate icon for an existing concept was found (see `reports/28-consistency.md`'s icon
  inventory). Pinned by `iconContract.test.ts` rather than changed.
- The brand seam was already single-owned (`packages/brand/generated.ts` exports `BRAND` /
  `BRAND_SIGNATURE` / `brandedTitle`; console and entrant import, never re-assemble). Pinned by
  `brandSeamContract.test.ts` rather than changed. No rename — deferred per plan §3.
- Five structural hairline borders in shared component files used an alpha-suffixed
  `border-border/NN` instead of the canonical `border-rule-soft` token (a class-level fix, not a
  string). Listed in `reports/28-consistency.md`; not a ledger row because no rendered text
  changed.
