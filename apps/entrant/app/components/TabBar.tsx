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
  // `overflow-x-auto` on a wrapper, not the group: five short labels fit
  // 390px, and if a locale ever does not, the strip scrolls INSIDE itself
  // (R11 — the page never scrolls sideways).
  return (
    <div className="overflow-x-auto">
      <SegmentedNav label="Tournament sections" segments={segments} />
    </div>
  );
}
