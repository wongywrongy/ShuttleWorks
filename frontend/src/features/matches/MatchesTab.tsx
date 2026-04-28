/**
 * New Matches tab — inline spreadsheet + auto-generate panel; no dialogs.
 */
import { Download } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { exportMatchesXlsx } from '../exports/xlsxExports';
import { AutoGeneratePanel } from './AutoGeneratePanel';
import { MatchesSpreadsheet } from './MatchesSpreadsheet';
import { INTERACTIVE_BASE } from '../../lib/utils';

export function MatchesTab() {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Matches</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generate a tournament's matches automatically or edit manually.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportMatchesXlsx(matches, players, groups)}
          disabled={matches.length === 0}
          data-testid="export-matches"
          className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50`}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Export XLSX
        </button>
      </header>
      <AutoGeneratePanel />
      <MatchesSpreadsheet />
    </div>
  );
}
