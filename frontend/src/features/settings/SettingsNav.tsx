/**
 * Vertical section nav for the SettingsShell.
 *
 * Industry pattern (Linear / Stripe / Notion / GitHub): a persistent
 * left rail of section labels, the active one highlighted. Click → swap
 * the right pane. Sections that aren't yet meaningful (e.g., Demos
 * before sample tournaments are loaded) can be marked ``hint`` so the
 * row still renders but reads as muted.
 */
import type { LucideIcon } from 'lucide-react';
import { INTERACTIVE_BASE } from '../../lib/utils';

export interface SettingsSection {
  id: string;
  label: string;
  icon?: LucideIcon;
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
      className="flex flex-col gap-0.5 py-2 pr-1"
    >
      {sections.map((s) => {
        const isActive = s.id === activeId;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={isActive ? 'page' : undefined}
            className={[
              INTERACTIVE_BASE,
              'group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            ].join(' ')}
            data-testid={`settings-nav-${s.id}`}
          >
            {Icon && (
              <Icon
                aria-hidden="true"
                className={`h-4 w-4 flex-shrink-0 ${isActive ? '' : 'opacity-70'}`}
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
