/**
 * Three-state theme pill: Light / System / Dark.
 *
 * Stored under its own persist key (see ``preferencesStore``) so a
 * tournament import/export does not clobber it — theme is a per-device
 * concern, not a per-tournament concern.
 */
import { Monitor, Moon, Sun } from '@phosphor-icons/react';
import { INTERACTIVE_BASE } from '../lib/utils';
import { usePreferencesStore, type ThemePreference } from '../store/preferencesStore';

type Option = { id: ThemePreference; label: string; Icon: typeof Sun };

const OPTIONS: Option[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'system', label: 'System', Icon: Monitor },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

type Size = 'sm' | 'md';

export function ThemeToggle({ size = 'sm' }: { size?: Size }) {
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);

  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center rounded-md border border-border bg-card p-0.5"
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const isActive = theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => setTheme(id)}
            className={[
              INTERACTIVE_BASE,
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            <Icon size={iconSize} aria-hidden="true" />
            {size === 'md' ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
