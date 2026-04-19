/**
 * Parse a Schedule XLSX export back into ScheduleAssignment rows.
 *
 * This is a disaster-recovery tool: given an unmodified file produced by
 * exportScheduleXlsx, rebuild schedule.assignments by looking each row's
 * (eventRank, sideA names, sideB names) up against the matches already in
 * the app state. The export is not round-trippable for roster / config /
 * match-state — only the schedule assignments. See
 * docs/superpowers/specs/2026-04-19-schedule-xlsx-import-design.md.
 */
import type ExcelJSNs from 'exceljs';
type ExcelJSType = typeof ExcelJSNs;

import type { MatchDTO, PlayerDTO, TournamentConfig } from '../../api/dto';

export interface ImportedAssignment {
  matchId: string;
  slotId: number;
  courtId: number;
  durationSlots: number;
}

export interface ImportWarning {
  row: number; // 1-indexed Excel row number
  timeLabel: string;
  court: string;
  event: string;
  sideA: string;
  sideB: string;
  reason: string;
}

export interface ImportResult {
  assignments: ImportedAssignment[];
  warnings: ImportWarning[];
  totalRows: number;
}

const EXPECTED_HEADERS = [
  'Match Times',
  'Court #',
  'Called',
  'Began',
  'Event',
  'Side A',
  'Side B',
  'Score',
];

function normalizeHeader(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

export async function parseScheduleXlsx(
  file: File,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig,
): Promise<ImportResult> {
  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) {
    throw new Error('schedule export: workbook has no sheets');
  }

  const header = sheet.getRow(1);
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (normalizeHeader(header.getCell(i + 1).value) !== EXPECTED_HEADERS[i].toLowerCase()) {
      throw new Error(
        `This doesn't look like a Tournament Scheduler schedule export (column ${i + 1} header mismatch)`,
      );
    }
  }

  void matches;
  void players;
  void config;
  return { assignments: [], warnings: [], totalRows: 0 };
}
