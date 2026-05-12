import { useAppStore, type AppTab } from '../store/appStore';
import { AppStatusPopover } from '../components/AppStatusPopover';
import { INTERACTIVE_BASE } from '../lib/utils';

type TabDef = { id: AppTab; label: string; hint?: string };

const TABS: TabDef[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'roster', label: 'Roster' },
  { id: 'matches', label: 'Matches' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'live', label: 'Live' },
  { id: 'tv', label: 'TV' },
];

export function TabBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);

  const disabledTabs = new Set<AppTab>();
  if (players.length === 0) disabledTabs.add('matches');
  if (matches.length === 0) disabledTabs.add('schedule');
  if (matches.length === 0) disabledTabs.add('live');

  return (
    <nav
      aria-label="Tournament scheduler tabs"
      className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Boxed wordmark. The 1px frame *is* the mark — no separate
            glyph. Sizes match the design system's TabBar lockup
            (26px tall · 13px Geist SemiBold · 4px radius). */}
        <span
          aria-label="ShuttleWorks"
          title="ShuttleWorks"
          className="hidden h-[26px] items-center rounded-[4px] border border-foreground px-[9px] text-[13px] font-semibold leading-none tracking-[-0.005em] text-foreground sm:inline-flex"
        >
          ShuttleWorks
        </span>
        <div role="tablist" aria-label="Sections" className="flex items-center gap-0.5">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const isDisabled = disabledTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                disabled={isDisabled}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-selected={isActive}
                aria-disabled={isDisabled || undefined}
                title={
                  isDisabled
                    ? tab.id === 'matches'
                      ? 'Add players first'
                      : tab.id === 'schedule' || tab.id === 'live'
                        ? 'Create matches first'
                        : undefined
                    : undefined
                }
                data-testid={`tab-${tab.id}`}
                className={[
                  INTERACTIVE_BASE,
                  // Brutalist tab: mono uppercase, square corners, no bg
                  // tint on active — the brand-orange underline + brand
                  // text color carry the active signal alone. The
                  // shadcn-default `bg-primary/10 rounded-md` pill is
                  // banned (BRAND.md §3, §1.10).
                  'relative rounded-none px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider',
                  isActive
                    ? 'text-brand'
                    : isDisabled
                      ? 'text-muted-foreground/50'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                ].join(' ')}
              >
                {tab.label}
                {/* Brand-orange underline. Always rendered so the
                    inactive→active transition grows the width via scaleX
                    on a transform-anchored span (GPU-safe), following
                    the shared --ease-brand curve. Square corners — the
                    underline IS the brutalist accent. */}
                <span
                  aria-hidden
                  className={[
                    'absolute inset-x-2 -bottom-[1px] h-0.5 origin-center bg-brand',
                    'transition-transform duration-300 ease-brand',
                    isActive ? 'scale-x-100' : 'scale-x-0',
                  ].join(' ')}
                />
              </button>
            );
          })}
        </div>
      </div>
      {/* Header chrome stays minimal: just the live status. Theme +
          density toggles live in Setup → Appearance. */}
      <div className="flex items-center gap-2">
        <AppStatusPopover />
      </div>
    </nav>
  );
}
