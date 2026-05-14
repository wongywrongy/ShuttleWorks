/**
 * DataSettings — section 05 (Tournament data) of the Setup tab.
 *
 * Mounts the real `TournamentFileManagement` (JSON export/import) and
 * `BackupPanel` (server-side backup list + XLSX recover) feature
 * components, plus a destructive "Reset tournament" escape hatch.
 *
 * Earlier iterations had stub Row buttons here labeled "wire into
 * TournamentFileManagement / BackupPanel actions in a follow-up" — the
 * follow-up is this commit. Both feature components own their own
 * Section chrome via `SettingsPrimitives.Section`, so they slot in
 * directly without an outer SectionHeader.
 */
import { useEffect, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { useClearAllData } from '../../hooks/useClearAllData';
import { BackupPanel } from '../setup/BackupPanel';
import { TournamentFileManagement } from '../tournaments/TournamentFileManagement';
import { Row, SectionHeader } from './SettingsControls';

export function DataSettings() {
  const clearAllData = useClearAllData();

  // Two-click confirm for the destructive Reset — first click flips
  // the button into a red "Click again to wipe" state for 4 s; second
  // click within that window actually clears the store. Pattern
  // mirrors the player-remove confirm in MatchDetailsPanel and the
  // generate-replace confirm in AutoGeneratePanel.
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    clearAllData();
  };

  return (
    <div>
      <TournamentFileManagement />
      <BackupPanel />

      <SectionHeader>Reset</SectionHeader>
      <Row
        label="Clear all data"
        control={
          <Button
            type="button"
            variant={confirmReset ? 'destructive' : 'outline'}
            size="sm"
            onClick={handleReset}
            title="Wipes groups, players, matches, schedule, and live state. Configuration is reset to defaults. localStorage is cleared on next save."
          >
            {confirmReset ? 'Click again to wipe' : 'Reset tournament'}
          </Button>
        }
        last
      />
    </div>
  );
}
