/**
 * New Matches tab — inline spreadsheet + auto-generate panel; no dialogs.
 */
import { Download } from '@phosphor-icons/react';
import { useAppStore } from '../../store/appStore';
import { exportMatchesXlsx } from '../exports/xlsxExports';
import { AutoGeneratePanel } from './AutoGeneratePanel';
import { MatchesSpreadsheet } from './MatchesSpreadsheet';
import { PageHeader } from '../../components/PageHeader';
import { INTERACTIVE_BASE } from '../../lib/utils';

export function MatchesTab() {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <PageHeader
        eyebrow="Matches"
        title="Match construction"
        description="Generate the day's match list automatically or edit it row-by-row."
        actions={
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
        }
      />
      {/* One outer surface — auto-generate and the matches table read as
       *  a single page section, separated only by a hairline divider. */}
      <div className="rounded border border-border bg-card">
        <AutoGeneratePanel />
        <div className="border-t border-border/60" />
        <MatchesSpreadsheet />
      </div>
    </div>
  );
}
