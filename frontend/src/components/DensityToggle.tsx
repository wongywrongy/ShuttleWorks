/**
 * Two-state density pill: Comfortable / Compact.
 *
 * Per-device preference (see ``preferencesStore``). Drives the
 * ``data-density`` attribute on <html> via ``useAppliedDensity()``;
 * components that consume the density-aware spacing utilities
 * (``h-row``, ``py-cell``, ``px-cell``, ``gap-section``) reflow
 * automatically.
 */
import { SquaresFour, Rows } from '@phosphor-icons/react';
import { INTERACTIVE_BASE } from '../lib/utils';
import { usePreferencesStore, type DensityPreference } from '../store/preferencesStore';

type Option = { id: DensityPreference; label: string; Icon: typeof Rows };

const OPTIONS: Option[] = [
  { id: 'comfortable', label: 'Comfortable', Icon: SquaresFour },
  { id: 'compact', label: 'Compact', Icon: Rows },
];

type Size = 'sm' | 'md';

export function DensityToggle({ size = 'sm' }: { size?: Size }) {
  const density = usePreferencesStore((s) => s.density);
  const setDensity = usePreferencesStore((s) => s.setDensity);

  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <div
      role="radiogroup"
      aria-label="Density"
      className="inline-flex items-center rounded-md border border-border bg-card p-0.5"
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const isActive = density === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => setDensity(id)}
            className={[
              INTERACTIVE_BASE,
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
