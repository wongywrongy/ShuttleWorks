/**
 * Appearance section content — theme + density toggles.
 *
 * Per-device preferences only (never part of tournament export).
 */
import { ThemeToggle } from '../../components/ThemeToggle';
import { DensityToggle } from '../../components/DensityToggle';
import { Surface, Section, Field } from './SettingsPrimitives';

export function AppearanceSettings() {
  return (
    <Surface>
      <Section title="Per-device">
        <Field label="Theme" hint="Light or dark — persisted on this browser only.">
          <ThemeToggle size="md" />
        </Field>
        <Field label="Density" hint="Comfortable adds breathing room; compact packs more on-screen.">
          <DensityToggle size="md" />
        </Field>
      </Section>
    </Surface>
  );
}
