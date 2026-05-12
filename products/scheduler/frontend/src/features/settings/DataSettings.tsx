/**
 * DataSettings — section 05 (Tournament data) of the Setup tab.
 *
 * Export / import buttons + a stub backup list + recover-from-XLSX
 * trigger. Per the rebuild spec the buttons are plain (no-op for now)
 * and the backup entries are static placeholders. The handlers can be
 * wired to the existing TournamentFileManagement / BackupPanel
 * actions in a follow-up — the goal of this pass is the uniform-rows
 * shape across all 5 sections of the Setup tab.
 */
import { Button } from '@/components/ui/button';
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
  // Stub handlers — these will hook into TournamentFileManagement /
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

  return (
    <div className="max-w-2xl">
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
        last
      />

      <SectionHeader>Backups</SectionHeader>
      {PLACEHOLDER_BACKUPS.map((b, i) => (
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
          last={i === PLACEHOLDER_BACKUPS.length - 1}
        />
      ))}

      <SectionHeader>Recover schedule</SectionHeader>
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
    </div>
  );
}
