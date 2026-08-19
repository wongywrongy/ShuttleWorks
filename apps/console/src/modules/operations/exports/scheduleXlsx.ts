/**
 * Operations schedule XLSX export (moved from meet/exports at SP-CONSOLE-4
 * B4: the Plan toolbar owns the schedule export; meet keeps the roster and
 * matches exports).
 *
 * Layout: Match Times | Court # | Called | Began | Event | Side A | Side B | Score
 * with a merged warm-up banner, per-time-group tinting, and heavy rules
 * between time groups. Called/Began/Score stay blank for the ops desk.
 */
// ExcelJS is large (~400 kB min). Loaded lazily inside exportScheduleXlsx so
// it never enters the initial bundle.
import type ExcelJSNs from 'exceljs';
import { indexById } from '../../../lib/indexById';
import { getActiveAssignments } from '../../../lib/getActiveAssignments';
import {
  applyRangeStyle,
  downloadXlsx,
  sideNames,
  todayStamp,
} from '../../../lib/xlsxExportShared';
type ExcelJSType = typeof ExcelJSNs;

import type {
  MatchDTO,
  PlayerDTO,
  ScheduleDTO,
  TournamentConfig,
} from '../../../api/dto';

const AM_PM = (hours: number, minutes: number): string => {
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const suf = hours < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minutes).padStart(2, '0')} ${suf}`;
};

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}

function formatSlotAmPm(slot: number, config: TournamentConfig): string {
  const startMin = timeToMinutes(config.dayStart);
  let mins = startMin + slot * config.intervalMinutes;
  mins = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  return AM_PM(Math.floor(mins / 60), mins % 60);
}

function minusMinutesFromHHMM(hhmm: string, minus: number): string {
  let m = timeToMinutes(hhmm) - minus;
  m = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
  return AM_PM(Math.floor(m / 60), m % 60);
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'schedule';
}

export async function exportScheduleXlsx(
  schedule: ScheduleDTO | null,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig | null,
): Promise<void> {
  if (!schedule || !config) return;

  // Lazy-load the heavy library — keeps the Schedule bundle small.
  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tournament Scheduler';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Schedule', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // ---- Columns ----------------------------------------------------------
  // Side A and Side B get their own columns (school vs school, no merge).
  // A: Match Times, B: Court #, C: Called, D: Began, E: Event,
  // F: Side A, G: Side B, H: Score.
  sheet.columns = [
    { header: 'Match Times', key: 'time',  width: 16 },
    { header: 'Court #',     key: 'court', width: 10 },
    { header: 'Called',      key: 'called',width: 9 },
    { header: 'Began',       key: 'began', width: 9 },
    { header: 'Event',       key: 'event', width: 10 },
    { header: 'Side A',      key: 'sideA', width: 30 },
    { header: 'Side B',      key: 'sideB', width: 30 },
    { header: 'Score',       key: 'score', width: 10 },
  ];

  // Header row — bold, centered, thick bottom border.
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;
  for (let c = 1; c <= 8; c++) {
    const cell = headerRow.getCell(c);
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thick', color: { argb: 'FF000000' } },
      left:   { style: 'thin', color: { argb: 'FF000000' } },
      right:  { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  // ---- Warm-up banner ---------------------------------------------------
  // 6 rows spanning the 30 min before the first scheduled match, all sharing
  // the same clock time (e.g., "10:00 AM" when first match is 10:30 AM).
  // Read via getActiveAssignments so an export reflects whichever
  // candidate the operator currently has selected (not the cold
  // "candidate #0" the solver returned originally).
  const activeAssignments = getActiveAssignments(schedule);
  const sorted = [...activeAssignments].sort(
    (a, b) => a.slotId - b.slotId || a.courtId - b.courtId,
  );

  const matchById = indexById(matches);
  const playerById = indexById(players);

  const WARMUP_ROWS = 6;
  // Warm-up clock time = 30 min before the first match (or day start if empty).
  const warmupTime = sorted.length > 0
    ? minusMinutesFromHHMM(
        `${String(Math.floor((timeToMinutes(config.dayStart) + sorted[0].slotId * config.intervalMinutes) / 60)).padStart(2, '0')}:${String((timeToMinutes(config.dayStart) + sorted[0].slotId * config.intervalMinutes) % 60).padStart(2, '0')}`,
        30,
      )
    : minusMinutesFromHHMM(config.dayStart, 30);

  const warmupStart = 2;
  const warmupEnd = warmupStart + WARMUP_ROWS - 1;
  for (let r = warmupStart; r <= warmupEnd; r++) {
    const row = sheet.getRow(r);
    row.getCell(1).value = warmupTime;
  }
  // Warm-up banner spans the Side A + Side B columns for the 6-row block.
  sheet.mergeCells(`F${warmupStart}:G${warmupEnd}`);
  const warmupCell = sheet.getCell(`F${warmupStart}`);
  warmupCell.value = 'Warm up';
  warmupCell.alignment = { vertical: 'middle', horizontal: 'center' };
  warmupCell.font = { bold: true, size: 12, color: { argb: 'FF374151' } };

  // Warm-up block styling: light grey, thick border below.
  applyRangeStyle(sheet, warmupStart, warmupEnd, 1, 8, {
    fill: 'FFF3F4F6',
    thickBottom: true,
  });

  // ---- Match rows -------------------------------------------------------
  let rowIdx = warmupEnd + 1;
  let currentTimeLabel: string | null = null;
  let groupStart = rowIdx;

  // Alternate the block tint — rose for odd groups, slightly warmer rose
  // for even — so adjacent time groups are visually distinct even without
  // the thick black border (which we also draw).
  let groupIndex = 0;
  const paletteA = 'FFFCE7E7';
  const paletteB = 'FFF8DCDC';

  const closeGroup = (endRow: number) => {
    if (endRow < groupStart) return;
    const tint = groupIndex % 2 === 0 ? paletteA : paletteB;
    applyRangeStyle(sheet, groupStart, endRow, 1, 8, {
      fill: tint,
      thickBottom: true,
    });
    groupIndex++;
  };

  for (const a of sorted) {
    const timeLabel = formatSlotAmPm(a.slotId, config);
    if (timeLabel !== currentTimeLabel) {
      if (currentTimeLabel !== null) {
        closeGroup(rowIdx - 1);
      }
      currentTimeLabel = timeLabel;
      groupStart = rowIdx;
    }
    const match = matchById.get(a.matchId);
    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = timeLabel;
    row.getCell(2).value = a.courtId;
    // C: Called, D: Began — left blank for ticking on-the-day.
    row.getCell(5).value = match?.eventRank ?? '';
    // F: Side A, G: Side B — separate columns so schools are visually split.
    row.getCell(6).value = sideNames(match?.sideA, playerById);
    row.getCell(7).value = sideNames(match?.sideB, playerById);
    // H: Score left blank.

    rowIdx++;
  }
  if (currentTimeLabel !== null) closeGroup(rowIdx - 1);

  // Column-level alignment tweaks.
  sheet.getColumn(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(2).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(5).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(6).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(7).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(8).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(6).font = { size: 11 };
  sheet.getColumn(7).font = { size: 11 };

  // Row heights: keep the data dense but readable.
  for (let r = warmupStart; r < rowIdx; r++) {
    sheet.getRow(r).height = 20;
  }
  // Slightly taller warm-up block so the merged label breathes.
  for (let r = warmupStart; r <= warmupEnd; r++) {
    sheet.getRow(r).height = 24;
  }

  const name = config.tournamentDate
    ? `schedule_${sanitize(config.tournamentDate)}.xlsx`
    : `schedule_${todayStamp()}.xlsx`;

  await downloadXlsx(name, wb);
}
