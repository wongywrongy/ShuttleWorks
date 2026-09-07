/**
 * Spreadsheet formula-injection guard for exported free text.
 *
 * Excel (and Sheets, and LibreOffice) treat a cell whose text begins with
 * `=`, `+`, `-`, `@`, a tab or a carriage return as a FORMULA, so an operator
 * who types `=HYPERLINK("http://evil","click")` — or `+cmd|'/c calc'!A0` — as
 * a player name turns a downloaded roster into live code on the next person's
 * machine. Prefixing a single apostrophe is the canonical fix: Excel strips it
 * on display and the cell stays inert text.
 *
 * Apply this to USER-AUTHORED STRING cells only (names, notes, group and club
 * names). Numbers and dates must reach ExcelJS as numbers and dates — quoting
 * them would turn a sortable column into text.
 */

/** A leading tab or CR is itself a trigger, so it is tested before trimming. */
const RAW_LEAD = /^[\t\r]/;
/** Excel looks past leading spaces before deciding, so trim those first. */
const FORMULA_LEAD = /^[=+\-@]/;

/**
 * The cell text to write for a user-authored string. Non-strings are
 * stringified; strings that cannot start a formula are returned unchanged;
 * anything else is prefixed with a single apostrophe.
 */
export function safeCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  if (RAW_LEAD.test(text)) return `'${text}`;
  return FORMULA_LEAD.test(text.replace(/^[ \n]+/, '')) ? `'${text}` : text;
}
