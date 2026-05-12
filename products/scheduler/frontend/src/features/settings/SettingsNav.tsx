/**
 * Vertical section nav for the SettingsShell.
 *
 * Industry pattern (Linear / Stripe / Notion / GitHub): a persistent
 * left rail of section labels, the active one highlighted. Click → swap
 * the right pane. Sections that aren't yet meaningful can be marked
 * ``hint`` so the row still renders but reads as muted.
 */
import type { Icon } from '@phosphor-icons/react';
import { INTERACTIVE_BASE } from '../../lib/utils';

export interface SettingsSection {
  id: string;
  label: string;
  icon?: Icon;
  hint?: string;
}

interface SettingsNavProps {
  sections: SettingsSection[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function SettingsNav({ sections, activeId, onSelect }: SettingsNavProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col py-1"
    >
      {sections.map((s, i) => {
        const isActive = s.id === activeId;
        const Icon = s.icon;
        // Brutalist signature: numeric index in mono + left-border accent
        // on the active row instead of a full background pill. Keeps the
        // rail scannable and visually rigid without making it shouty.
        const index = String(i + 1).padStart(2, '0');
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={isActive ? 'page' : undefined}
            className={[
              INTERACTIVE_BASE,
              'group relative flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left text-sm',
              isActive
                ? 'border-l-brand bg-muted/50 text-foreground font-semibold'
                : 'border-l-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground',
            ].join(' ')}
            data-testid={`settings-nav-${s.id}`}
          >
            <span
              className={[
                'font-mono text-2xs tabular-nums tracking-wider',
                isActive ? 'text-brand' : 'text-muted-foreground/60',
              ].join(' ')}
              aria-hidden="true"
            >
              {index}
            </span>
            {Icon && (
              <Icon
                aria-hidden="true"
                className={`h-4 w-4 flex-shrink-0 ${isActive ? '' : 'opacity-60'}`}
              />
            )}
            <span className="flex-1 truncate">{s.label}</span>
            {s.hint && (
              <span className="text-2xs text-muted-foreground/70">{s.hint}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
