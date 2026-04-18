import { useState } from 'react';
import { useTournament } from '../hooks/useTournament';
import { useLockGuard } from '../hooks/useLockGuard';
import { TournamentConfigForm } from '../features/tournaments/TournamentConfigForm';
import { TournamentFileManagement } from '../features/tournaments/TournamentFileManagement';
import { BackupPanel } from '../features/setup/BackupPanel';
import { ScheduleLockIndicator } from '../components/status/ScheduleLockIndicator';
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
    dayStart: "09:00",
    dayEnd: "18:00",
    breaks: [],
    courtCount: 4,
    defaultRestMinutes: 30,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
  };

  const displayConfig = config || defaultConfig;
  const isNewTournament = !config && error && error.includes("not found");

  if (loading && !config && !error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tournament configuration...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-3">Tournament Setup</h2>

      {/* Lock indicator */}
      {isLocked && (
        <ScheduleLockIndicator showUnlockHint className="mb-3" />
      )}

      {isNewTournament && (
        <div className="mb-2 p-2 bg-blue-100 border border-blue-400 text-blue-700 rounded-sm text-sm">
          <p className="font-semibold">New Tournament</p>
          <p>Configure your tournament settings below. The tournament will be created when you save.</p>
        </div>
      )}

      {error && !isNewTournament && (
        <div className="mb-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded-sm text-sm">
          {error}
        </div>
      )}

      {saveError && (
        <div className="mb-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded-sm text-sm">
          {saveError}
        </div>
      )}

      <TournamentConfigForm
        config={displayConfig}
        onSave={handleSave}
        saving={saving}
      />

      <div className="mt-3">
        <TournamentFileManagement />
      </div>

      <div className="mt-3">
        <BackupPanel />
      </div>
    </div>
  );
}
