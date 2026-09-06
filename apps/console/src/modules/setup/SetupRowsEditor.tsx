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
import { Fragment, useState } from 'react';

export type SetupRow = Record<string, unknown>;

export interface RowsColumn {
  field: string;
  label: string;
  /** `list` renders a text input holding a comma-separated string array. */
  type?: 'text' | 'date' | 'time' | 'email' | 'list' | 'checkbox' | 'select';
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
}

const INPUT_CLASS =
  'h-8 w-full rounded-sm border border-rule-control bg-bg-elev px-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function cellValue(row: SetupRow, column: RowsColumn): string {
  const value = row[column.field];
  if (column.type === 'list') {
    return Array.isArray(value) ? value.map((item) => {
      const raw = String(item);
      return column.options?.find((option) => option.value === raw)?.label ?? raw;
    }).join(', ') : '';
  }
  return value == null ? '' : String(value);
}

function parsedValue(raw: string, column: RowsColumn): unknown {
  if (column.type === 'list') {
    const options = column.options ?? [];
    return raw
      .split(',')
      .map((part) => {
        const trimmed = part.trim();
        return options.find((option) => option.label === trimmed)?.value ?? trimmed;
      })
      .filter((part) => part.trim() !== '')
  }
  return raw;
}

function listDraftValue(raw: string): string[] {
  return raw.split(',').filter((part) => part.trim() !== '');
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
  const [listDrafts, setListDrafts] = useState<Record<string, string>>({});
  const listColumn = columns.find((column) => column.type === 'list');
  const recordColumns = listColumn ? columns.filter((column) => column !== listColumn) : columns;
  const gridTemplate = `${columns.map((column) => {
    if (column.type === 'checkbox') return 'auto';
    if (column.type === 'date') return 'minmax(9rem, 1fr)';
    if (column.type === 'time') return 'minmax(7rem, .8fr)';
    if (column.type === 'list') return 'minmax(11rem, 1.2fr)';
    if (column.field === 'name') return 'minmax(11rem, 1.4fr)';
    return 'minmax(7rem, 1fr)';
  }).join(' ')} auto`;
  const recordGridTemplate = `${recordColumns.map((column) => {
    if (column.type === 'checkbox') return 'auto';
    if (column.type === 'date') return 'minmax(8rem, 1.1fr)';
    if (column.type === 'time') return 'minmax(6.5rem, .9fr)';
    if (column.field === 'name') return 'minmax(0, 1.4fr)';
    return 'minmax(0, 1fr)';
  }).join(' ')} auto`;

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
            className="grid min-w-0 items-center gap-x-3 gap-y-2 px-3 py-2"
            style={{ gridTemplateColumns: listColumn ? recordGridTemplate : gridTemplate }}
          >
            {(listColumn ? recordColumns : columns).map((column) => (
              <span
                key={column.field}
                className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground"
              >
                {column.label}
              </span>
            ))}
            <span aria-hidden="true" />
            {rows.map((row, index) => {
              const rowKey = String(row.id ?? index);
              if (listColumn) {
                return (
                  <Fragment key={rowKey}>
                    {recordColumns.map((column) =>
                      column.type === 'checkbox' ? (
                        <input
                          key={`${rowKey}-${column.field}`}
                          type="checkbox"
                          checked={Boolean(row[column.field])}
                          onChange={(event) => patchRow(index, column.field, event.target.checked)}
                          aria-label={`${column.label} for row ${index + 1}`}
                          className="h-4 w-4 justify-self-start rounded border-rule-control accent-accent focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : column.type === 'select' ? (
                        <select
                          key={`${rowKey}-${column.field}`}
                          value={cellValue(row, column)}
                          onChange={(event) => patchRow(index, column.field, event.target.value)}
                          aria-label={`${column.label} for row ${index + 1}`}
                          className={INPUT_CLASS}
                        >
                          <option value="">Select {column.label.toLowerCase()}</option>
                          {(column.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          key={`${rowKey}-${column.field}`}
                          type={column.type ?? 'text'}
                          value={cellValue(row, column)}
                          placeholder={column.placeholder}
                          onChange={(event) => patchRow(index, column.field, parsedValue(event.target.value, column))}
                          aria-label={`${column.label} for row ${index + 1}`}
                          className={INPUT_CLASS}
                        />
                      ),
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      aria-label={`Remove row ${index + 1}`}
                    >
                      Remove
                    </Button>
                    <div className="col-span-full min-w-0">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        {listColumn.label}
                      </span>
                      <input
                        type="text"
                        value={listDrafts[`${rowKey}-${listColumn.field}`] ?? cellValue(row, listColumn)}
                        placeholder={listColumn.placeholder}
                        onFocus={() => setListDrafts((drafts) => ({ ...drafts, [`${rowKey}-${listColumn.field}`]: cellValue(row, listColumn) }))}
                        onChange={(event) => { setListDrafts((drafts) => ({ ...drafts, [`${rowKey}-${listColumn.field}`]: event.target.value })); patchRow(index, listColumn.field, listDraftValue(event.target.value)); }}
                        onBlur={(event) => {
                          patchRow(index, listColumn.field, parsedValue(event.target.value, listColumn));
                          setListDrafts((drafts) => { const next = { ...drafts }; delete next[`${rowKey}-${listColumn.field}`]; return next; });
                        }}
                        aria-label={`${listColumn.label} for row ${index + 1}`}
                        className={INPUT_CLASS}
                      />
                      <p className="mt-1 whitespace-normal text-xs leading-4 text-muted-foreground">
                        {cellValue(row, listColumn) || 'No courts assigned'}
                      </p>
                    </div>
                  </Fragment>
                );
              }
              return [
                ...columns.map((column) =>
                  column.type === 'list' ? (
                    <div key={`${rowKey}-${column.field}`} className="col-span-full min-w-0">
                      <input type="text" value={listDrafts[`${rowKey}-${column.field}`] ?? cellValue(row, column)} placeholder={column.placeholder} onFocus={() => setListDrafts((drafts) => ({ ...drafts, [`${rowKey}-${column.field}`]: cellValue(row, column) }))} onChange={(event) => { setListDrafts((drafts) => ({ ...drafts, [`${rowKey}-${column.field}`]: event.target.value })); patchRow(index, column.field, listDraftValue(event.target.value)); }} onBlur={(event) => { patchRow(index, column.field, parsedValue(event.target.value, column)); setListDrafts((drafts) => { const next = { ...drafts }; delete next[`${rowKey}-${column.field}`]; return next; }); }} aria-label={`${column.label} for row ${index + 1}`} className={INPUT_CLASS} />
                      <p className="mt-1 whitespace-normal text-xs leading-4 text-muted-foreground">{cellValue(row, column) || 'No courts assigned'}</p>
                    </div>
                  ) : column.type === 'checkbox' ? (
                    <input
                      key={`${rowKey}-${column.field}`}
                      type="checkbox"
                      checked={Boolean(row[column.field])}
                      onChange={(event) => patchRow(index, column.field, event.target.checked)}
                      aria-label={`${column.label} for row ${index + 1}`}
                      className="h-4 w-4 justify-self-start rounded border-rule-control accent-accent focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : column.type === 'select' ? (
                    <select
                      key={`${rowKey}-${column.field}`}
                      value={cellValue(row, column)}
                      onChange={(event) => patchRow(index, column.field, event.target.value)}
                      aria-label={`${column.label} for row ${index + 1}`}
                      className={INPUT_CLASS}
                    >
                      <option value="">Select {column.label.toLowerCase()}</option>
                      {(column.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      key={`${rowKey}-${column.field}`}
                      type={column.type ?? 'text'}
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
