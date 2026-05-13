/**
 * DataSettings — section 05 (Tournament data) of the Setup tab.
 *
 * Export / import buttons + a stub backup list + recover-from-XLSX
 * trigger + a destructive "reset to empty" button that wipes
 * groups/players/matches/schedule/state back to a fresh-load
 * tournament. The reset is the user-facing escape hatch for clearing
 * accumulated testing data without going through DevTools.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '../../store/appStore';
import { Row, SectionHeader } from './SettingsControls';

interface BackupEntry {
  id: string;
  timestamp: string;
}

const PLACEHOLDER_BACKUPS: BackupEntry[] = [
  { id: 'b-2026-05-12-09-15', timestamp: '2026-05-12 09:15' },
  { id: 'b-2026-05-11-17-42', timestamp: '2026-05-11 17:42' },
  { id: 'b-2026-05-11-08-03', timestamp: '2026-05-11 08:03' },
];

export function DataSettings() {
  const clearAllData = useAppStore((s) => s.clearAllData);

  // Stub handlers — wire into TournamentFileManagement /
  // BackupPanel actions in a follow-up.
  const onExport = () => {
    /* no-op for now */
  };
  const onImport = () => {
    /* no-op for now */
  };
  const onRestore = (_id: string) => {
    /* no-op for now */
  };
  const onRecoverXlsx = () => {
    /* no-op for now */
  };

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
      <SectionHeader>Export &amp; import</SectionHeader>
      <Row
        label="Export"
        control={
          <Button type="button" variant="outline" size="sm" onClick={onExport}>
            Export
          </Button>
        }
      />
      <Row
        label="Import"
        control={
          <Button type="button" variant="outline" size="sm" onClick={onImport}>
            Import
          </Button>
        }
      />
      <Row
        label="Recover from XLSX"
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRecoverXlsx}
          >
            Recover from XLSX…
          </Button>
        }
        last
      />

      <SectionHeader>Backups</SectionHeader>
      {PLACEHOLDER_BACKUPS.map((b) => (
        <Row
          key={b.id}
          label={b.timestamp}
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRestore(b.id)}
            >
              Restore
            </Button>
          }
        />
      ))}

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
