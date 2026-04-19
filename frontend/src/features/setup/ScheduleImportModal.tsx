/**
 * Preview dialog for schedule-XLSX recovery imports.
 *
 * Shows the matched count, a scrollable warning list, and Apply / Cancel.
 * All parsing is done upstream — this component is pure presentation.
 */
import type { ImportResult } from './importScheduleXlsx';

interface Props {
  result: ImportResult;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}

export function ScheduleImportModal({ result, busy, onApply, onCancel }: Props) {
  const { assignments, warnings, totalRows } = result;
  const canApply = assignments.length > 0 && !busy;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import schedule"
      data-testid="schedule-import-modal"
    >
      <div className="w-full max-w-lg rounded-md bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-800">
          Recover schedule from XLSX
        </h2>
        <p className="mt-1 text-xs text-gray-600" data-testid="schedule-import-summary">
          Matched <strong>{assignments.length}</strong> of {totalRows} rows.
          {warnings.length > 0 ? ` ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.` : ''}
        </p>

        {warnings.length > 0 && (
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
        )}

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
            {busy ? 'Applying…' : `Apply ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
