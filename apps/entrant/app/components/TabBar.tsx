/**
 * The tournament frame's section navigation — links, not widgets (Z6).
 *
 * Deliberately NOT an ARIA tablist: that pattern promises same-page panel
 * switching, and these are navigations — each tab is a full (KB-scale)
 * document load. `aria-current="page"` names the active one. Renders null
 * below two entries: a one-tab bar is a placeholder in disguise (rule 4's
 * spirit), and the tabs themselves exist only when their data does
 * (`frameTabs`).
 *
 * ADR 0028 + contract §11.1: Overview · Schedule · Draws · Players ·
 * Documents, drawn as the site's segmented control (`SegmentedNav`). The bar
 * is decided in `lib/tournamentFrame.ts` and handed here already built, so
 * every tournament route — including a draw detail, a player page and the
 * regulations reader — shows the SAME bar with its parent tab highlighted.
 * Before P1 this component took a `hrefFor` callback and a bolt-on
 * `scheduleHref`, which is how two routes ended up composing two different
 * bars from the same data.
 */
import { SegmentedNav, type Segment } from "./SegmentedNav";
import type { FrameSection, FrameTab } from "../lib/tournamentFrame";

export function TabBar({
  tabs,
  active,
}: {
  tabs: readonly FrameTab[];
  active: FrameSection;
}) {
  if (tabs.length < 2) return null;
  const segments: Segment[] = tabs.map((tab) => ({
    label: tab.label,
    href: tab.href,
    current: tab.id === active,
  }));
  // ONE row, always (public refinement 2026-09-12): the five labels fit a
  // 390px viewport on one line, and anything narrower scrolls this strip
  // INSIDE itself rather than dropping "Documents" onto a second line under
  // the others (R11 — the page never scrolls sideways). `-mx-4 px-4` lets
  // the scroll region reach the page gutters so the last tab is never cut
  // at the content edge, and `scroll-px-4` keeps a scrolled-to tab clear of
  // that gutter. The selected tab is visible on arrival at every phone
  // width the tier supports; this document ships no script to scroll it.
  return (
    <div className="-mx-4 overflow-x-auto px-4 scroll-px-4">
      <SegmentedNav label="Tournament sections" segments={segments} wrap={false} />
    </div>
  );
}
