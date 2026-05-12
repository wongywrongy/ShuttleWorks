/**
 * Setup tab — settings shell with section-rail navigation.
 *
 * Each section pane owns its own controls + save flow. The shell
 * provides the layout; nothing else.
 */
import { useState } from 'react';
import { Sliders, Palette, Monitor, Database, Cpu } from '@phosphor-icons/react';
import { useTournament } from '../hooks/useTournament';
import { useLockGuard } from '../hooks/useLockGuard';
import { TournamentConfigForm } from '../features/tournaments/TournamentConfigForm';
import { ScheduleLockIndicator } from '../components/status/ScheduleLockIndicator';
import { PublicDisplaySettings } from '../features/tournaments/PublicDisplaySettings';
import { SettingsShell, type SettingsSectionDef } from '../features/settings/SettingsShell';
import { PageHeader } from '../components/PageHeader';
import { AppearanceSettings } from '../features/settings/AppearanceSettings';
import { EngineSettings } from '../features/settings/EngineSettings';
import { DataSettings } from '../features/settings/DataSettings';
import type { TournamentConfig } from '../api/dto';

export function TournamentSetupPage() {
  const { config, loading, error, updateConfig } = useTournament();
  const { isLocked, confirmUnlock } = useLockGuard();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (newConfig: TournamentConfig) => {
    if (!(await confirmUnlock())) return;
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
  // Settings), then Engine, Display, per-device Appearance, then Data
  // ops. Descriptions intentionally dropped per the rebuild spec —
  // labels only.
  const sections: SettingsSectionDef[] = [
    {
      id: 'tournament',
      label: 'Tournament',
      icon: Sliders,
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
      render: () => <EngineSettings />,
    },
    {
      id: 'display',
      label: 'Public display',
      icon: Monitor,
      render: () => <PublicDisplaySettings />,
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Palette,
      render: () => <AppearanceSettings />,
    },
    {
      id: 'data',
      label: 'Tournament data',
      icon: Database,
      render: () => <DataSettings />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <PageHeader
        eyebrow="Setup"
        title="Tournament configuration"
        description="Schedule, scoring, events, engine, and per-device preferences."
      />
      {/* Page-level alerts stay above the shell so they apply to every
          section. The shell itself never shows them. */}
      {isLocked && <ScheduleLockIndicator showUnlockHint />}
      {isNewTournament && (
        <div className="rounded border border-status-started/40 bg-status-started-bg px-3 py-2 text-xs text-status-started">
          <span className="font-semibold">New tournament — </span>
          configure settings below. Saved on first save.
        </div>
      )}
      {error && !isNewTournament && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {saveError && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <SettingsShell sections={sections} defaultSectionId="tournament" />
    </div>
  );
}
