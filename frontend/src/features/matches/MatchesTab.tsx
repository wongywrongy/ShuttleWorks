/**
 * New Matches tab — inline spreadsheet + auto-generate panel; no dialogs.
 */
import { useAppStore } from '../../store/appStore';
import { exportMatchesXlsx } from '../exports/xlsxExports';
import { AutoGeneratePanel } from './AutoGeneratePanel';
import { MatchesSpreadsheet } from './MatchesSpreadsheet';

export function MatchesTab() {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void exportMatchesXlsx(matches, players, groups)}
          disabled={matches.length === 0}
          data-testid="export-matches"
          className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⤓ Export matches XLSX
        </button>
      </div>
      <AutoGeneratePanel />
      <MatchesSpreadsheet />
    </div>
  );
}
