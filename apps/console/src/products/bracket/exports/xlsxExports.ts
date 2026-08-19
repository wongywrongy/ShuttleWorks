/**
 * Bracket XLSX exports — Schedule-style aesthetic, following the
 * meet's `products/meet/exports/xlsxExports.ts` idiom (bold centered
 * header with a thick black bottom rule, alternating rose row tints,
 * lazy-loaded ExcelJS so the bundle stays small). Bracket-local module:
 * Meet's exports dir is meet-internal, and products must not import each
 * other's internals (dependency-cruiser).
 *
 *   Roster:  Name | Events | Min rest (slots) | Availability | Notes
 *   Matches: Event | Discipline | # | Match | Side A | Side B | Status
 *
 * Matches used to leave through a raw `/export.csv` link labelled "Export
 * CSV" while every other surface in the product produced XLSX (defect D14).
 * The link is gone; the CSV route is untouched and still available to
 * anything that wants machine-readable output.
 */
import type ExcelJSNs from 'exceljs';
import type { BracketPlayerDTO } from '../../../api/dto';
import { formatWindowSummary } from '../../../components/control-plane';
import type { BadgeEntry } from '../rosterEvents';

type ExcelJSType = typeof ExcelJSNs;

const ROSE_A = 'FFFCE7E7';
const ROSE_B = 'FFF8DCDC';

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function downloadXlsx(
  filename: string,
  workbook: ExcelJSNs.Workbook,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Bold centered header with thick black bottom rule (shared aesthetic). */
function applyHeaderRow(sheet: ExcelJSNs.Worksheet, colCount: number): void {
  const row = sheet.getRow(1);
  row.font = { bold: true, size: 11 };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thick', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }
}

/** Alternating tint + thin grid, thick rule under the last row. */
function applyBodyRow(
  row: ExcelJSNs.Row,
  colCount: number,
  index: number,
  isLast: boolean,
): void {
  const tint = index % 2 === 0 ? ROSE_A : ROSE_B;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: isLast
        ? { style: 'thick', color: { argb: 'FF000000' } }
        : { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  }
}

/** One exported match row — already projected by the surface that owns the
 *  labels (friendly play-unit label, resolved side names, status word). */
export interface BracketMatchExportRow {
  event: string;
  discipline: string;
  n: number;
  match: string;
  sideA: string;
  sideB: string;
  status: string;
}

export async function exportBracketMatchesXlsx(
  rows: BracketMatchExportRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tournament Scheduler';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Matches', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Event', key: 'event', width: 10 },
    { header: 'Discipline', key: 'discipline', width: 20 },
    { header: '#', key: 'n', width: 6 },
    { header: 'Match', key: 'match', width: 14 },
    { header: 'Side A', key: 'sideA', width: 28 },
    { header: 'Side B', key: 'sideB', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  const colCount = 7;
  applyHeaderRow(sheet, colCount);

  rows.forEach((r, i) => {
    const row = sheet.getRow(i + 2);
    row.height = 20;
    row.getCell(1).value = r.event;
    row.getCell(2).value = r.discipline;
    row.getCell(3).value = r.n;
    row.getCell(4).value = r.match;
    row.getCell(5).value = r.sideA;
    row.getCell(6).value = r.sideB;
    row.getCell(7).value = r.status;
    applyBodyRow(row, colCount, i, i === rows.length - 1);
  });

  for (const c of [1, 3, 4, 7]) {
    sheet.getColumn(c).alignment = { vertical: 'middle', horizontal: 'center' };
  }
  for (const c of [2, 5, 6]) {
    sheet.getColumn(c).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  }

  await downloadXlsx(`bracket_matches_${todayStamp()}.xlsx`, wb);
}

export async function exportBracketRosterXlsx(
  players: BracketPlayerDTO[],
  /** player id → sorted badge entries (see rosterEvents.badgesByPlayerId). */
  badgesById: Map<string, BadgeEntry[]>,
): Promise<void> {
  if (players.length === 0) return;

  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tournament Scheduler';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Roster', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Events', key: 'events', width: 20 },
    { header: 'Min rest (slots)', key: 'rest', width: 16 },
    { header: 'Availability', key: 'availability', width: 32 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];
  const colCount = 5;
  applyHeaderRow(sheet, colCount);

  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((p, i) => {
    const row = sheet.getRow(i + 2);
    row.height = 20;
    row.getCell(1).value = p.name || '(unnamed)';
    row.getCell(2).value = (badgesById.get(p.id) ?? [])
      .map((b) => b.code)
      .join(', ');
    row.getCell(3).value = p.restSlots ?? '–';
    row.getCell(4).value = formatWindowSummary(p.availability ?? []);
    row.getCell(5).value = p.notes ?? '';

    // Alternating rose tint per row + thin grid, thick rule under the last
    // row — the meet exports' group treatment, at single-row granularity.
    applyBodyRow(row, colCount, i, i === sorted.length - 1);
  });

  sheet.getColumn(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(3).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(4).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(5).alignment = {
    vertical: 'middle',
    horizontal: 'left',
    indent: 1,
    wrapText: true,
  };

  await downloadXlsx(`bracket_roster_${todayStamp()}.xlsx`, wb);
}
