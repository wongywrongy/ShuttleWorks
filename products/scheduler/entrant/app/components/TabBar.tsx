/**
 * The tournament page's section navigation — links, not widgets (Z6).
 *
 * Deliberately NOT an ARIA tablist: that pattern promises same-page panel
 * switching, and these are navigations — each tab is a full (KB-scale)
 * document load. `aria-current="page"` names the active one. Renders null
 * below two tabs: a one-tab bar is a placeholder in disguise (rule 4's
 * spirit), and the tabs themselves exist only when their data does
 * (`visibleTabs`).
 */
import type { Tab } from '../lib/phase';

const TAB_LABELS: Readonly<Record<Tab, string>> = Object.freeze({
  overview: 'Overview',
  events: 'Events',
  entrants: 'Entrants',
});

export function TabBar({
  tabs,
  active,
  hrefFor,
}: {
  tabs: readonly Tab[];
  active: Tab;
  hrefFor: (tab: Tab) => string;
}) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Tournament sections" className="-mb-px">
      <ul className="flex gap-6 text-sm">
        {tabs.map((tab) => (
          <li key={tab}>
            <a
              href={hrefFor(tab)}
              aria-current={tab === active ? 'page' : undefined}
              className={`inline-block border-b-2 pb-2.5 pt-1 ${
                tab === active
                  ? 'border-action-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-rule-control hover:text-foreground'
              }`}
            >
              {TAB_LABELS[tab]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
