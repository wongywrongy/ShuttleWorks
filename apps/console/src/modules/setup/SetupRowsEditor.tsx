/**
 * SetupRowsEditor — the structured list editor for Setup sections that hold
 * repeating records (sessions, courts, events, contacts). SP-OPCON-1 INP-1:
 * replaces the pipe-delimited textareas, which forced operators to learn a
 * serialization syntax and silently clobbered fields the textarea could not
 * express (session notes, contact phone/public, event status).
 *
 * Two invariants the textarea implementation broke, kept here on purpose:
 *
 * - **Stable ids.** Every row keeps its existing `id`; a new row mints one
 *   once (`crypto.randomUUID`). The textareas regenerated `session-N` ids
 *   from the LINE INDEX on every keystroke, so deleting a line silently
 *   re-pointed every id below it.
 * - **No field clobbering.** An edit spreads the prior row object and
 *   patches only the edited field, so values with no column here (notes,
 *   status, phone) round-trip untouched.
 */
import { Button } from '@scheduler/design-system';

export type SetupRow = Record<string, unknown>;

export interface RowsColumn {
  field: string;
  label: string;
  /** `list` renders a text input holding a comma-separated string array. */
  type?: 'text' | 'date' | 'time' | 'email' | 'list' | 'checkbox';
  placeholder?: string;
}

const INPUT_CLASS =
  'h-8 w-full rounded-sm border border-rule-control bg-bg-elev px-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function cellValue(row: SetupRow, column: RowsColumn): string {
  const value = row[column.field];
  if (column.type === 'list') {
    return Array.isArray(value) ? value.map(String).join(', ') : '';
  }
  return value == null ? '' : String(value);
}

function parsedValue(raw: string, column: RowsColumn): unknown {
  if (column.type === 'list') {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return raw;
}

export function SetupRowsEditor({
  label,
  columns,
  rows,
  onChange,
  addLabel,
  newRow,
}: {
  label: string;
  columns: readonly RowsColumn[];
  rows: SetupRow[];
  onChange: (rows: SetupRow[]) => void;
  addLabel: string;
  /** Field defaults for a freshly added row; `id` is minted here. */
  newRow: () => SetupRow;
}) {
  const gridTemplate = `${columns.map((column) => (column.type === 'checkbox' ? 'auto' : 'minmax(0,1fr)')).join(' ')} auto`;

  const patchRow = (index: number, field: string, value: unknown) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-sm border border-border/60">
          <div
            className="grid items-center gap-x-3 gap-y-2 px-3 py-2"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((column) => (
              <span
                key={column.field}
                className="text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground"
              >
                {column.label}
              </span>
            ))}
            <span aria-hidden="true" />
            {rows.map((row, index) => {
              const rowKey = String(row.id ?? index);
              return [
                ...columns.map((column) =>
                  column.type === 'checkbox' ? (
                    <input
                      key={`${rowKey}-${column.field}`}
                      type="checkbox"
                      checked={Boolean(row[column.field])}
                      onChange={(event) => patchRow(index, column.field, event.target.checked)}
                      aria-label={`${column.label} for row ${index + 1}`}
                      className="h-4 w-4 justify-self-start rounded border-rule-control accent-accent focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : (
                    <input
                      key={`${rowKey}-${column.field}`}
                      type={column.type === 'list' ? 'text' : (column.type ?? 'text')}
                      value={cellValue(row, column)}
                      placeholder={column.placeholder}
                      onChange={(event) => patchRow(index, column.field, parsedValue(event.target.value, column))}
                      aria-label={`${column.label} for row ${index + 1}`}
                      className={INPUT_CLASS}
                    />
                  ),
                ),
                <Button
                  key={`${rowKey}-remove`}
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  aria-label={`Remove row ${index + 1}`}
                >
                  Remove
                </Button>,
              ];
            })}
          </div>
        </div>
      ) : (
        <p className="rounded-sm border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      )}
      <div className="mt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, { id: crypto.randomUUID(), ...newRow() }])}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
