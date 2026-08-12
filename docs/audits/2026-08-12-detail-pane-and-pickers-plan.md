# The detail pane squeeze, and the third picker

Written 2026-08-12. **Plan and research only. Nothing here is implemented.**

Two owner reports:

> "whenever it appears the text on the side is squished which looks unprofessional"
> "when we click add player in the side menu it doesn't match the theme. also it could use a search bar"

---

# Part A. The squeeze

## A0. What is actually happening, measured

`DetailDock` is a real layout column: opening it **animates its own width so the sibling table
reflows**. Container queries then hide low-priority columns as room tightens. It is doing exactly what
it was designed to do, and the result still reads as damaged. Three mechanisms compound.

**A0.1 — `min-w-0` lets the name columns collapse below their content.** The shared match list
(`matchListColumns.ts`) is:

| columns | width |
| --- | --- |
| gutter, `#`, Event, Status, actions | **248px fixed** |
| **Side A** | `min-w-0 flex-[3]` |
| **Side B** | `min-w-0 flex-[3]` |

At the dock's **default 560px** content floor, the two name columns share `560 - 248 - gaps`, so about
**145px each**. "Rahul Nandakumar / Trevor Lindgren" in 145px, under this product's hard no-ellipsis
rule, has one option: wrap into a narrow ribbon. That is the squish. `min-w-0` is CSS Flexbox §4.5
being told the item may floor at zero.

**This is the same defect we already fixed once today.** The Hub name cell was `min-w-0`, collapsed to
63px, and `break-words` then broke words mid-word. The fix was `min-w-[12rem]` — a real floor. It was
applied at one site. Every other flexible text column in the app still says `min-w-0`.

**A0.2 — opening the pane deletes columns.** Column priorities are container-query keyed: priority 2
hides below **672px**, priority 3 below **896px**. Each dock hand-picks its content floor:

| Surface | floor | consequence when the pane opens |
| --- | --- | --- |
| Hub | **928** (derived: `896 + 32`) | correct: all four columns survive |
| Meet roster | 820 | below 896 |
| Bracket draws | 760 | below 896, so `Format` (priority 3) vanishes |
| Meet matches, Bracket matches, Bracket roster | **560 default** | below 672, so `Status`, `#`, `Min rest` vanish |
| Bracket LiveView | 0 | deliberate, pinned rail |

**Only the Hub's number was derived from the threshold its own columns use.** The rest are guesses, so
three more surfaces silently drop a column when a row is selected. That is D11, the Hub bug closed
this morning, with three further instances nobody had counted.

**A0.3 — animating `width` IS the visible squeeze.** Transitioning width forces layout on the sibling
every frame. web.dev's guidance is explicit: "instead of changing the `height` and `width` properties,
use `transform: scale()`", and names the harm as users "los[ing] their place while reading if the text
moves suddenly". (Caveat, stated honestly: the CLS *metric* excludes shifts within 500ms of a click,
so a click-opened pane is not scored against us. The metric excuses it; the rationale does not.)

## A1. What the research found

Full sourcing in the research pass; the load-bearing findings:

**Nobody recommends what we do.** Proportional table shrink is the single option no design system
endorses.

- **Material 3**: two panes side-by-side from **expanded (840dp)** up. Below that, single pane.
  Google's stated reason: "showing two panes at a **medium width can result in UI that is too narrow,
  especially for complex content**."
  ([canonical layouts](https://developer.android.com/develop/ui/views/layout/canonical-layouts),
  [window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes))
- **Microsoft list/details**: **320-640 epx stacked**, one pane at a time; **641 epx+** side-by-side.
  In *both* styles the list pane is a **ListView, never a data grid**.
  ([docs](https://learn.microsoft.com/en-us/windows/apps/design/controls/list-details))
- **Apple HIG**: "Prefer using a split view in a regular, not a compact, environment... it's difficult
  to display multiple panes **without wrapping or truncating the content**."
  ([split views](https://developer.apple.com/design/human-interface-guidelines/split-views))
- **Carbon**: a data table "should be given plenty of space to **display data without truncation**";
  "consider giving your data table the most width on the page."
  ([data table](https://carbondesignsystem.com/components/data-table/usage/))
- **SAP Fiori** publishes the only hard minimum: when more than one column shows, "the **minimal width
  of each column is 248px**."
  ([source](https://github.com/SAP/ui5-webcomponents/blob/main/packages/fiori/src/FlexibleColumnLayout.ts))

**The sharpest reframing: we have the flexibility on the wrong element.** Material's list-detail rule
is that the **list has a fixed width and the detail pane flexes**. We animate the pane and let the
table absorb it. Invert which element gives, and the complaint dissolves without any redesign.

**My hypothesis was only partly right.** I proposed that the list should change representation rather
than shrink — a purpose-built two-line summary row instead of a squeezed table.

- **Confirmed**: representation change is real and first-party. Shopify Polaris swaps the row *element*
  in code, `const RowWrapper = condensed ? 'li' : 'tr'`
  ([source](https://github.com/Shopify/polaris-react/blob/main/polaris-react/src/components/IndexTable/components/Row/Row.tsx)).
  Adrian Roselli explains why the element swap is the only safe way: `display:`-overriding a `<table>`
  breaks its semantics and "a screen reader user will be stranded"
  ([source](https://adrianroselli.com/2020/11/under-engineered-responsive-tables.html)).
- **Refuted**: the trigger is always **viewport** width, never "a sibling pane opened". Polaris
  condenses below a 490px viewport; Microsoft stacks below 641 epx; SAP below 599px; M3 below 840dp.
  Nobody restructures a list because a pane opened at 1440px. Adopting it here is extrapolation.
- **My best evidence is uncitable.** Outlook's 2-line rows and Apple Mail's columns are *user
  settings*, not adaptations to reading-pane width. The causal story I believed is real in behaviour
  and absent from every vendor's documentation.

**Two things I did not know that change the answer:**

- **WCAG 1.4.10 exempts data tables from reflow.** Letting a table scroll horizontally is explicitly
  sanctioned ([Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)). This
  is cheaper than a second row component and I had skipped it.
- **NN/g recommends the overlay this codebase already rejected**: a "nonmodal panel [that] opens
  beside a table, it partially obscures the data but preserves functionality", preferred over modals
  ([data tables](https://www.nngroup.com/articles/data-tables/)). Our rejection ("it hid the right
  columns") is a real objection, but NN/g's reasoning is that overlapping beats displacing, because
  the table stays whole underneath.

## A2. Proposed sequence

Ranked by (harm removed) ÷ (cost). **None of this is started.**

**S1 — Stop transitioning `width`.** Snap the dock's width; animate only the pane's own
`transform`/`opacity`. This is the mechanism that makes the table visibly deform during the
transition, which is most of "looks unprofessional". Cheap and independent of everything below.

**S2 — Give every flexible text column a real minimum.** Replace `min-w-0` with a content-derived
floor on the name/side columns, exactly as the Hub's `min-w-[12rem]` already does. A column that
cannot be read at its width is not a narrower column, it is a broken one.

**S3 — Derive `minContentWidth` from the table's own priorities.** The floor should be computed from
the column set (fixed widths + the S2 minimums + the highest priority threshold in use), not hand-
picked per site. The Hub already does this and pins it with a test that fails if either number moves
alone. Removes the vanishing-column class outright, in three surfaces.

**S4 — Below the derived floor, the table scrolls rather than compresses.** Roselli's recipe:
`<div role="region" aria-labelledby="..." tabindex="0">` + `overflow-x: auto` + a focus outline. WCAG
sanctions it for tables specifically. Cost: about ten lines, no new component. Trade honestly stated:
a horizontal scrollbar appears and right-hand columns go off-screen — the same information loss the
overlay was rejected for, except recoverable by scrolling instead of by closing the pane.

**S5 — Owner decision: raise the overlay threshold.** Four design systems say a ~768px viewport should
show **one pane, not two**. We currently try to show both, and the owner has ruled the console must
work at tablet width. These may be in conflict. Changing one number makes the tablet case match every
cited system; it also means an operator on a tablet cannot see list and detail together. **This is a
product call and I am not making it.**

**S6 — Deferred: the two-track summary list.** Real design work (a second row component, a
primary/secondary field triage, a new home for column-header sorting), on a trigger no source attests.
Only worth it if S1-S4 leave the horizontal scroll annoying in practice. Do not start here.

**Not recommended: a resizable divider.** Apple sanctions it conditionally and Airtable Interfaces
persists a width, but no design system offers it as the answer to "the list is too narrow". It fixes
nothing by default; it only lets a user repair a bad default themselves.

## A3. What the sources could not settle

- **No source publishes a minimum width for a table.** SAP's 248px is per column, Carbon's 480px is a
  fixed panel width, Polaris's 490px is a viewport breakpoint. Our S2/S3 numbers will be derived from
  our own content, not borrowed.
- **Nobody documents how to signal the push-to-overlay mode change to the user.** Complete silence
  across M3, Apple, Fluent, Carbon, Polaris and NN/g. Fluent explicitly declines to define a rule.
- **Container-width vs viewport-width triggers are unaddressed.** Every spec keys off window size.
  Ours is the case container queries exist for and that none of these specs was written for. We are
  extrapolating knowingly.
- One directly on-point Material rule ("list fixed, detail flexible") could only be surfaced through
  search; `m3.material.io` is a JS-rendered SPA that would not fetch. It is consistent with everything
  else cited, but it is unverified.

---

# Part B. The third picker

## B0. What is there

`MatchPlayerPicker.tsx` (created **today**, in the console IA pass) is a hand-rolled option list:

- **No search.** It renders every rostered player as a button. The demo has 48 players in one
  workspace and 390 across the deployment.
- **Its own styling** — `text-xs`, `rounded`, `bg-accent/10 text-accent` for selection, a Phosphor
  `Check` — none of it shared with the picker built in the same pass.

Meanwhile `EventPicker.tsx`, built hours earlier in the same programme, already has: search that
appears past 10 options, grouping, native `radio`/`checkbox` semantics so state is announced by the
platform, a live `N selected` readout, and per-option `meta` for context.

And Bracket's `ParticipantPicker` **already uses `EventPicker` to pick people** — options built as
`{ code: player name, discipline: name initial }`, grouped A-Z with search. So the codebase contains
both the right answer and the wrong answer for the same problem, one day old, in two adjacent files.

This is the "one concept, N spellings" finding from the IA proposal reproducing itself immediately
after that proposal was executed.

## B1. Proposal

**B1.1 — `MatchPlayerPicker` delegates to `EventPicker`.** The option shape already fits:

| field | value |
| --- | --- |
| `code` | player name (what the operator reads) |
| `discipline` | the group key: `Eligible for {rank}` for eligible players, school name otherwise |
| `meta` | the context the current list encodes as a `·` suffix |
| `disabled` | capacity rules, as `ParticipantPicker` already does |

This preserves the behaviour the current component was written for (eligible-for-this-rank first, then
everyone by school, because mid-tournament reassignment must stay possible) and inherits search,
grouping, keyboard operation and theme for free. The file mostly deletes.

**B1.2 — rename `EventPicker`.** Two of its three consumers pick **people**, not events. The name is
already lying, and a misleading name is why someone hand-rolled a fourth picker rather than reaching
for it. Something like `OptionPicker`. Mechanical, three call sites.

**B1.3 — lower the search threshold, or make it per-consumer.** `EVENT_PICKER_SEARCH_THRESHOLD = 10`
was chosen for event lists. For a 48-player roster the search box is right at any size; for a 3-option
list it is noise. The threshold should be a prop with the current value as its default.

**B1.4 — check the remaining hand-rolled pickers.** `PlayerSearchPicker` (the roster grid's
click-to-assign combobox) already has search but is a fourth idiom, with `role="listbox"` semantics
its own audit flagged as incomplete. Fold it in or record why it stays.

## B2. Cost

B1.1 and B1.3 are small and self-contained. B1.2 is mechanical. B1.4 needs a look before it can be
sized. None of it needs a new component, because the component already exists.

---

## What needs a ruling before work starts

1. **S5, the tablet question**: four design systems say ~768px should show one pane, not two. The
   owner has ruled the console must work at tablet width. Which wins?
2. **S4's trade**: a horizontal scrollbar and off-screen columns, recoverable by scrolling, in
   exchange for a table that never deforms. Acceptable?
3. **S6**: leave the two-track list deferred, or fund the design work now?
