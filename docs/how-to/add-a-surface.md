# How to add a surface

**Goal:** add a new destination (a "surface" / segment) to an **existing**
module — for example a new tab in Meet — and have it appear in the sidebar and
pass the contract test.

This is the small sibling of [How to add a module](/how-to/add-a-module): the
same `AppTab` + `buildWorkspaceNav` + `moduleContract` steps, minus the module
registration.

::: info Requirements
- The module already exists (it's in `ModuleId` / `MODULE_IDS`).
- You know which anatomy stage the surface belongs to (intake / engine / emit) —
  this decides its order in the nav.
:::

## 1 · Add the segment to `AppTab`

```ts
// products/scheduler/frontend/src/store/uiStore.ts  (the AppTab union, ~line 19)
export type AppTab =
  | /* …existing… */
  | 'standings';   // a new Meet emit surface
```

## 2 · Add it to the module's nav section

Insert a `WsNavItem` in the module's section inside
`buildWorkspaceNav` (`platform/product-shell/workspaceNav.ts:71`), in
**intake → engine → emit** order (Configuration before outputs):

```ts
items: [
  { segment: 'roster', label: 'Roster' },
  { segment: 'setup', label: 'Configuration' },
  { segment: 'matches', label: 'Matches' },
  { segment: 'standings', label: 'Standings' },   // ← new emit surface
],
```

## 3 · Render it in the product

The product component switches on `activeTab` and renders the surface that owns
it. Add the branch (see `products/meet/MeetProduct.tsx` for the pattern).

## 4 · Update the contract

`ownedSegments` in the module's descriptor
(`platform/contracts/moduleContract.ts`) must list **every** sidebar segment the
module owns — the test asserts `ownedSegments` equals what `buildWorkspaceNav`
renders for that section. Add the new segment:

```ts
ownedSegments: ['roster', 'setup', 'matches', 'standings'],
```

::: tip Internal surfaces are different
A surface reached from *another surface* (not the sidebar) is still an `AppTab`,
but it is **not** in `buildWorkspaceNav` and **not** in `ownedSegments`. The
bracket internals `bracket-events` and `bracket-draw` are the precedent — the
contract test (`moduleContract.test.ts`) explicitly asserts no descriptor claims
them. Add an internal surface to `AppTab` only; route to it from its parent.
:::

## Verify

```bash
cd products/scheduler/frontend
npx vitest run src/platform/contracts   # ownedSegments must match the nav
npx tsc -b
```

## See also

- [How to add a module](/how-to/add-a-module) · [Module contracts](/contracts/)
- [System overview](/architecture/system-overview)
