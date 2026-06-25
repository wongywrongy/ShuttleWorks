/**
 * Two-zone settings shell — mirrors RosterTab's operator-terminal
 * vocabulary. Persistent left rail of sections, right pane with a
 * compact `[eyebrow][icon][section]` header strip on top of a
 * scrollable content area.
 *
 *   ┌────────────────┬─────────────────────────────────────────┐
 *   │                │ SETUP  ⚙ Tournament                     │
 *   │  SettingsNav   ├─────────────────────────────────────────┤
 *   │  (section      │                                         │
 *   │   list)        │  section.render() — form, scrollable    │
 *   │                │                                         │
 *   └────────────────┴─────────────────────────────────────────┘
 *       w-60                       fills remaining
 *
 * Active section is mirrored in `?section=<id>` so deep links work
 * and back-button restores the previous section view. Per MOTION.md
 * §200-204 the section swap stays a hard cut (Emil — "would feel slow
 * on the 8th switch"), so this shell intentionally has no swap
 * animation.
 *
 * Each section component owns its own save affordance — some sections
 * are fire-and-forget toggles (theme, density), others heavy forms
 * with dirty-state + success-flash. The shell never persists.
 */
import { useMemo } from 'react';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { SettingsNav, type SettingsSection } from './SettingsNav';

export interface SettingsSectionDef extends SettingsSection {
  /** Title rendered as the bold subject in the operator header strip.
   *  Defaults to `label`. */
  title?: string;
  /** Optional muted-context line shown after the title in the header
   *  strip — typically dropped on Settings since each section is
   *  already named in the rail. */
  description?: string;
  /** Section content. */
  render: () => React.ReactNode;
}

interface SettingsShellProps {
  sections: SettingsSectionDef[];
  defaultSectionId?: string;
  /** Eyebrow text shown at the top-left of the right-pane header strip.
   *  Defaults to `"Setup"` so the page is self-labelled. */
  eyebrow?: string;
  /** Section-nav placement.
   *  - `'vertical'` (default): persistent left rail — the classic two-zone
   *    shell. Use when the shell is the page's only left chrome.
   *  - `'horizontal'`: section nav becomes a top segmented tab strip with no
   *    left rail. Use when an outer chrome (e.g. the workspace sidebar)
   *    already owns the left edge, so a second stacked rail would read as
   *    redundant. */
  orientation?: 'vertical' | 'horizontal';
}

export function SettingsShell({
  sections,
  defaultSectionId,
  eyebrow = 'Setup',
  orientation = 'vertical',
}: SettingsShellProps) {
  const fallback = defaultSectionId ?? sections[0]?.id ?? '';
  const [activeId, setActiveId] = useSearchParamState('section', fallback, {
    debounceMs: 0,
  });

  const active = useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0],
    [sections, activeId],
  );

  if (!active) return null;

  const ActiveIcon = active.icon;

  // ───── HORIZONTAL: top tab strip, no left rail ─────
  // Used when an outer chrome owns the left edge (workspace sidebar). The tab
  // row both names the active section and replaces the redundant icon+title
  // header strip, so the section name is never rendered twice. The row never
  // wraps — it scrolls horizontally on narrow content widths.
  if (orientation === 'horizontal') {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-stretch gap-3 border-b border-border bg-card px-4">
          <span className="flex shrink-0 items-center text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </span>
          <nav
            aria-label="Settings sections"
            data-testid="settings-tabs"
            className="flex min-w-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden"
          >
            {sections.map((s) => {
              const isActive = s.id === active.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`settings-nav-${s.id}`}
                  className={[
                    'relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors duration-fast ease-brand',
                    isActive
                      ? 'border-b-accent font-semibold text-foreground'
                      : 'border-b-transparent text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {Icon ? (
                    <Icon
                      aria-hidden="true"
                      className={`h-4 w-4 ${isActive ? '' : 'opacity-60'}`}
                    />
                  ) : null}
                  <span>{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div
          role="region"
          aria-label={`${eyebrow} — ${active.title ?? active.label}`}
          className="min-h-0 flex-1 overflow-auto px-4 pb-6"
        >
          {active.render()}
        </div>
      </div>
    );
  }

  // ───── VERTICAL (default): persistent left rail ─────
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ───── LEFT RAIL ───── */}
      <aside
        data-testid="settings-rail"
        className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card"
      >
        <SettingsNav
          sections={sections}
          activeId={active.id}
          onSelect={setActiveId}
        />
      </aside>

      {/* ───── RIGHT PANE ───── */}
      <main
        aria-labelledby={`section-${active.id}-title`}
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        {/* Operator header strip — single baseline. Mirrors Roster /
            Matches: `px-4 py-3 bg-card border-b`. Eyebrow + bold
            section name (with the section's own icon glyph beside it)
            + optional muted description, all on one line. */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </span>
            <span className="flex items-center gap-1.5">
              {ActiveIcon ? (
                <ActiveIcon
                  aria-hidden="true"
                  className="h-4 w-4 text-muted-foreground"
                />
              ) : null}
              <span
                id={`section-${active.id}-title`}
                className="text-sm font-semibold text-foreground"
              >
                {active.title ?? active.label}
              </span>
            </span>
            {active.description ? (
              <span className="truncate text-xs text-muted-foreground">
                {active.description}
              </span>
            ) : null}
          </div>
        </header>

        {/* Scrollable content. Horizontal padding lives here so each
            section's form-internal SectionHeader (`pt-6 pb-2`) handles
            the vertical rhythm; bottom padding so the save button
            doesn't sit flush with the viewport edge. */}
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
          {active.render()}
        </div>
      </main>
    </div>
  );
}
