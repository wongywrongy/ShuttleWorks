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
    <div className="grid h-full min-h-[calc(100vh-3rem)] grid-cols-1 gap-4 lg:grid-cols-[14rem_1fr]">
      {/* Left rail */}
      <aside className="lg:sticky lg:top-12 lg:self-start lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:border-r lg:border-border/60 lg:pr-2">
        <SettingsNav
          sections={sections}
          activeId={active.id}
          onSelect={setActiveId}
        />
      </aside>

      {/* Right pane */}
      <main
        aria-labelledby={`section-${active.id}-title`}
        className="min-w-0 pb-12"
      >
        <header className="mb-3 border-b border-border/60 pb-2">
          <h2
            id={`section-${active.id}-title`}
            className="text-base font-semibold text-foreground"
          >
            {active.title ?? active.label}
          </h2>
          {active.description && (
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {active.description}
            </p>
          )}
        </header>
        <div>{active.render()}</div>
      </main>
    </div>
  );
}
