/**
 * Two-column settings shell — sticky left rail + scrollable right pane.
 *
 * Drop-in replacement for any "page-of-cards" admin surface. Active
 * section is mirrored in ``?section=<id>`` so deep links work and a
 * back-button click restores the previous section view.
 *
 * Each section's component renders inside a max-width pane with its
 * own scroll. The shell intentionally has no save bar of its own —
 * sections that need persistence (e.g., the tournament config form)
 * own their own save affordance, since some sections are fire-and-
 * forget toggles (theme, density) and others are heavy forms.
 */
import { useMemo } from 'react';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { SettingsNav, type SettingsSection } from './SettingsNav';

export interface SettingsSectionDef extends SettingsSection {
  /** Title rendered at the top of the right pane. Defaults to ``label``. */
  title?: string;
  /** Optional helper line under the section title. */
  description?: string;
  /** Section content. */
  render: () => React.ReactNode;
}

interface SettingsShellProps {
  sections: SettingsSectionDef[];
  defaultSectionId?: string;
}

export function SettingsShell({ sections, defaultSectionId }: SettingsShellProps) {
  const fallback = defaultSectionId ?? sections[0]?.id ?? '';
  const [activeId, setActiveId] = useSearchParamState('section', fallback, {
    debounceMs: 0,
  });

  const active = useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0],
    [sections, activeId],
  );

  if (!active) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
      {/* Left rail. The parent <main> in AppShell owns scrolling, so the
          rail uses position:sticky with a top offset that matches the
          TabBar height (h-12 = 3rem) plus our root padding. */}
      <aside className="lg:sticky lg:top-2 lg:self-start lg:border-r lg:border-border/60 lg:pr-3">
        <SettingsNav
          sections={sections}
          activeId={active.id}
          onSelect={setActiveId}
        />
      </aside>

      {/* Right pane */}
      <main
        aria-labelledby={`section-${active.id}-title`}
        className="min-w-0"
      >
        {/* Brutalist section lockup: mono uppercase eyebrow with [ ]
            bracket framing, then the title in sans semibold. Hard rule
            underline (2px) separates from the section body. */}
        <header className="mb-4 border-b-2 border-border pb-3">
          <div
            className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground"
            aria-hidden="true"
          >
            [ SETUP / {active.label.toUpperCase()} ]
          </div>
          <h2
            id={`section-${active.id}-title`}
            className="mt-1 text-lg font-semibold tracking-tight text-foreground"
          >
            {active.title ?? active.label}
          </h2>
          {active.description && (
            <p className="mt-1 text-xs text-muted-foreground">
              {active.description}
            </p>
          )}
        </header>
        <div>{active.render()}</div>
      </main>
    </div>
  );
}
