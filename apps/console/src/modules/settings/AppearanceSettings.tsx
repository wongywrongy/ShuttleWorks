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
import { Row, Section, Seg } from '../../platform/engine-config/SettingsControls';

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
      {/* Single column, like every other config surface. The two-column split
          with a centre rule was the last surface still running its own layout,
          and it halved the width the shared control column needs. */}
      <Section title="Per-device">
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
          last
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
      </Section>
      <p className="mt-3 text-xs text-muted-foreground">
        Saved per browser.
      </p>
    </div>
  );
}
