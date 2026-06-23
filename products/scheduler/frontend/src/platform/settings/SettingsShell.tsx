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
}

export function SettingsShell({
  sections,
  defaultSectionId,
  eyebrow = 'Setup',
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
