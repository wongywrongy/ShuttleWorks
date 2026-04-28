/**
 * Appearance section content — theme + density toggles.
 *
 * Was an inline card on the Setup page; pulled into its own component
 * so the new SettingsShell can render it as a section. Per-device
 * preferences only (never part of tournament export).
 */
import { ThemeToggle } from '../../components/ThemeToggle';
import { DensityToggle } from '../../components/DensityToggle';

export function AppearanceSettings() {
  return (
    <div className="space-y-4">
      <Row label="Theme">
        <ThemeToggle size="md" />
      </Row>
      <Row label="Density">
        <DensityToggle size="md" />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-border bg-card px-4 py-3">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
