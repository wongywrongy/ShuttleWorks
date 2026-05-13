/**
 * AppearanceSettings — section 04 (Appearance) of the Setup tab.
 *
 * Per-device preferences only (never part of tournament export).
 * Reads + writes the preferences store directly; no save button —
 * changes apply immediately. Below the rows a small muted line
 * communicates the per-browser scope without using row-level
 * descriptions.
 */
import {
  usePreferencesStore,
  type ThemePreference,
  type DensityPreference,
} from '../../store/preferencesStore';
import { Row, SectionHeader, Seg } from './SettingsControls';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light',  label: 'Light'  },
  { value: 'system', label: 'System' },
  { value: 'dark',   label: 'Dark'   },
];

const DENSITY_OPTIONS: { value: DensityPreference; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact',     label: 'Compact'     },
];

export function AppearanceSettings() {
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const density = usePreferencesStore((s) => s.density);
  const setDensity = usePreferencesStore((s) => s.setDensity);

  return (
    <div>
      <SectionHeader>Per-device</SectionHeader>
      <div className="relative grid grid-cols-1 md:grid-cols-2 md:gap-x-12 md:before:absolute md:before:inset-y-0 md:before:left-1/2 md:before:-translate-x-1/2 md:before:w-px md:before:bg-border/60">
        <Row
          label="Theme"
          control={
            <Seg
              options={THEME_OPTIONS}
              value={theme}
              onChange={setTheme}
              ariaLabel="Theme"
            />
          }
        />
        <Row
          label="Density"
          control={
            <Seg
              options={DENSITY_OPTIONS}
              value={density}
              onChange={setDensity}
              ariaLabel="Density"
            />
          }
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Saved per browser.
      </p>
    </div>
  );
}
