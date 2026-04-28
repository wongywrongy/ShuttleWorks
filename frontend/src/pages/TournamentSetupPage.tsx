/**
 * Setup tab — settings shell with section-rail navigation.
 *
 * Each section pane owns its own controls + save flow. The shell
 * provides the layout; nothing else.
 */
import { useState } from 'react';
import { Sliders, Palette, Monitor, Database, Sparkles, Cpu } from 'lucide-react';
import { useTournament } from '../hooks/useTournament';
import { useLockGuard } from '../hooks/useLockGuard';
import { TournamentConfigForm } from '../features/tournaments/TournamentConfigForm';
import { TournamentFileManagement } from '../features/tournaments/TournamentFileManagement';
import { BackupPanel } from '../features/setup/BackupPanel';
import { ScheduleLockIndicator } from '../components/status/ScheduleLockIndicator';
import { PublicDisplaySettings } from '../features/tournaments/PublicDisplaySettings';
import { SettingsShell, type SettingsSectionDef } from '../features/settings/SettingsShell';
import { AppearanceSettings } from '../features/settings/AppearanceSettings';
import { EngineSettings } from '../features/settings/EngineSettings';
import { DemoLoader } from '../features/settings/DemoLoader';
import type { TournamentConfig } from '../api/dto';

export function TournamentSetupPage() {
  const { config, loading, error, updateConfig } = useTournament();
  const { isLocked, confirmUnlock } = useLockGuard();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (newConfig: TournamentConfig) => {
    if (!confirmUnlock()) return;
    try {
      setSaving(true);
      setSaveError(null);
      await updateConfig(newConfig);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Show default config if tournament doesn't exist (404 error)
  const defaultConfig: TournamentConfig = {
    intervalMinutes: 30,
    dayStart: '09:00',
    dayEnd: '18:00',
    breaks: [],
    courtCount: 4,
    defaultRestMinutes: 30,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
  };

  const displayConfig = config || defaultConfig;
  const isNewTournament = !config && error && error.includes('not found');

  if (loading && !config && !error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading tournament configuration…</div>
      </div>
    );
  }

  // Section definitions wired to the SettingsShell. Order is intentional:
  // Tournament first (the heaviest config; usually why people opened
  // Settings), then Display (also config-shaped), then per-device
  // Appearance, then Data ops, then Demos.
  const sections: SettingsSectionDef[] = [
    {
      id: 'tournament',
      label: 'Tournament',
      icon: Sliders,
      description: 'Schedule, scoring, events, and optimisation knobs.',
      render: () => (
        <TournamentConfigForm
          config={displayConfig}
          onSave={handleSave}
          saving={saving}
        />
      ),
    },
    {
      id: 'engine',
      label: 'Engine',
      icon: Cpu,
      description: 'Solver tuning + reproducibility — how schedules are produced.',
      render: () => <EngineSettings />,
    },
    {
      id: 'display',
      label: 'Public display',
      icon: Monitor,
      description: 'Layout, brand, and content of the venue TV.',
      render: () => <PublicDisplaySettings />,
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Palette,
      description: 'Per-device theme and density. Not part of tournament export.',
      render: () => <AppearanceSettings />,
    },
    {
      id: 'data',
      label: 'Tournament data',
      icon: Database,
      description: 'Export, import, and rolling backups.',
      render: () => (
        <div className="space-y-3">
          <TournamentFileManagement />
          <BackupPanel />
        </div>
      ),
    },
    {
      id: 'demos',
      label: 'Demos',
      icon: Sparkles,
      hint: 'soon',
      description: 'Pre-baked sample tournaments to explore the app.',
      render: () => <DemoLoader />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      {/* Page-level alerts stay above the shell so they apply to every
          section. The shell itself never shows them. */}
      {isLocked && <ScheduleLockIndicator showUnlockHint />}
      {isNewTournament && (
        <div className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100">
          <span className="font-semibold">New tournament — </span>
          configure settings below. Saved on first save.
        </div>
      )}
      {error && !isNewTournament && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {saveError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <SettingsShell sections={sections} defaultSectionId="tournament" />
    </div>
  );
}
