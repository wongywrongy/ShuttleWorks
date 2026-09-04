/**
 * The tournament page's section navigation — links, not widgets (Z6).
 *
 * Deliberately NOT an ARIA tablist: that pattern promises same-page panel
 * switching, and these are navigations — each tab is a full (KB-scale)
 * document load. `aria-current="page"` names the active one. Renders null
 * below two entries: a one-tab bar is a placeholder in disguise (rule 4's
 * spirit), and the tabs themselves exist only when their data does
 * (`visibleTabs`).
 *
 * ADR 0028: four entries at most — Overview · Schedule · Draws · Players —
 * drawn as the site's segmented control (`SegmentedNav`).
 */
import type { Tab } from "../lib/phase";
import { SegmentedNav, type Segment } from "./SegmentedNav";

const TAB_LABELS: Readonly<Record<Tab, string>> = Object.freeze({
  overview: "Overview",
  draws: "Draws",
  players: "Players",
});

export function TabBar({
  tabs,
  active,
  hrefFor,
  scheduleHref,
}: {
  tabs: readonly Tab[];
  active: Tab | "schedule";
  hrefFor: (tab: Tab) => string;
  scheduleHref?: string;
}) {
  const segments: Segment[] = [];
  for (const tab of tabs) {
    segments.push({ label: TAB_LABELS[tab], href: hrefFor(tab), current: tab === active });
    if (tab === "overview" && scheduleHref) {
      segments.push({ label: "Schedule", href: scheduleHref, current: active === "schedule" });
    }
  }
  if (segments.length < 2) return null;
  // `overflow-x-auto` on a wrapper, not the group: four short labels fit
  // 390px, and if a locale ever does not, the strip scrolls INSIDE itself
  // (R11 — the page never scrolls sideways).
  return (
    <div className="overflow-x-auto">
      <SegmentedNav label="Tournament sections" segments={segments} />
    </div>
  );
}
