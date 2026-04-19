/**
 * Preview dialog for XLSX imports.
 *
 * Two variants:
 *   - schedule-only: matched N of M rows, warning list, Apply replaces
 *     schedule.assignments.
 *   - full-rebuild: detected schools/players/matches/assignments, Apply
 *     replaces the entire tournament state.
 */
import type { ImportResult, ImportWarning } from './importScheduleXlsx';

interface Props {
  result: ImportResult;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}

function WarningTable({ warnings }: { warnings: ImportWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mt-3 max-h-64 overflow-y-auto rounded border border-gray-200">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-2 py-1 font-medium">Row</th>
            <th className="px-2 py-1 font-medium">Time</th>
            <th className="px-2 py-1 font-medium">Court</th>
            <th className="px-2 py-1 font-medium">Event</th>
            <th className="px-2 py-1 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {warnings.map((w, i) => (
            <tr key={i} data-testid={`schedule-import-warning-${i}`}>
              <td className="px-2 py-1 text-gray-500">{w.row}</td>
              <td className="px-2 py-1 text-gray-700">{w.timeLabel || '—'}</td>
              <td className="px-2 py-1 text-gray-700">{w.court || '—'}</td>
              <td className="px-2 py-1 text-gray-700">{w.event || '—'}</td>
              <td className="px-2 py-1 text-orange-700">{w.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScheduleImportModal({ result, busy, onApply, onCancel }: Props) {
  let title = 'Recover schedule from XLSX';
  let summary: React.ReactNode = null;
  let warnings: ImportWarning[] = [];
  let applyLabel = '';
  let canApply = false;

  if (result.mode === 'schedule-only') {
    const { assignments, warnings: ws, totalRows } = result;
    warnings = ws;
    canApply = assignments.length > 0 && !busy;
    summary = (
      <>
        Matched <strong>{assignments.length}</strong> of {totalRows} rows.
        {ws.length > 0 ? ` ${ws.length} warning${ws.length === 1 ? '' : 's'}.` : ''}
      </>
    );
    applyLabel = `Apply ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}`;
  } else {
    const { plan } = result;
    title = 'Rebuild tournament from XLSX';
    warnings = plan.warnings;
    canApply = plan.matches.length > 0 && !busy;
    summary = (
      <>
        Detected <strong>{plan.schools.length}</strong> schools (
        {plan.schools.join(' vs ')}), <strong>{plan.players.length}</strong> players,{' '}
        <strong>{plan.matches.length}</strong> matches,{' '}
        <strong>{plan.assignments.length}</strong> scheduled of {plan.totalScheduleRows} rows.
        <span className="block text-[11px] text-orange-700">
          This replaces your entire current tournament (groups, players, matches, schedule).
        </span>
      </>
    );
    applyLabel = `Rebuild tournament`;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="schedule-import-modal"
    >
      <div className="w-full max-w-lg rounded-md bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <p className="mt-1 text-xs text-gray-600" data-testid="schedule-import-summary">
          {summary}
        </p>

        <WarningTable warnings={warnings} />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply}
            data-testid="schedule-import-apply"
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Applying…' : applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
