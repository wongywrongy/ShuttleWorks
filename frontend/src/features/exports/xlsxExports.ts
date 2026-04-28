/**
 * Polished XLSX schedule export.
 *
 * Matches the reference sheet layout:
 *
 *   Match Times | Court # | Called | Began | Event | Matches | | Score
 *
 * with:
 *   - bold, centered header row
 *   - a merged "Warm up" banner in the 30 min leading up to the first match
 *   - one row per scheduled match, grouped by start time
 *   - alternating per-group background tint (rose for match blocks; grey for warm-up)
 *   - heavy black border beneath every time-group transition
 *   - doubles rendered as "Name1 & Name2"
 *   - Called / Began columns left blank so the ops team can tick them on the day
 *   - Score column left blank (filled in during play)
 */
// ExcelJS is large (~400 kB min). Loaded lazily inside exportScheduleXlsx so
// it never enters the initial bundle.
import type ExcelJSNs from 'exceljs';
import { indexById } from '../../store/selectors';
type ExcelJSType = typeof ExcelJSNs;

import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  ScheduleDTO,
  TournamentConfig,
} from '../../api/dto';

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

function sideNames(ids: string[] | undefined, playerById: Map<string, PlayerDTO>): string {
  if (!ids || ids.length === 0) return '';
  return ids.map((id) => playerById.get(id)?.name ?? id).join(' & ');
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'schedule';
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function downloadXlsx(filename: string, workbook: ExcelJSNs.Workbook): Promise<void> {
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
  const sorted = [...schedule.assignments].sort(
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

/** Apply a fill + thin cell borders to every cell in a rectangle, optionally
 * ending with a thick black bottom rule so time groups stand apart. */
function applyRangeStyle(
  sheet: ExcelJSNs.Worksheet,
  r1: number,
  r2: number,
  c1: number,
  c2: number,
  opts: { fill?: string; thickBottom?: boolean },
): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = sheet.getRow(r).getCell(c);
      if (opts.fill) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: opts.fill },
        };
      }
      const isBottom = r === r2 && opts.thickBottom;
      cell.border = {
        top:    cell.border?.top    ?? { style: 'thin', color: { argb: 'FFBFBFBF' } },
        bottom: isBottom
          ? { style: 'thick', color: { argb: 'FF000000' } }
          : (cell.border?.bottom ?? { style: 'thin', color: { argb: 'FFBFBFBF' } }),
        left:   cell.border?.left   ?? { style: 'thin', color: { argb: 'FFBFBFBF' } },
        right:  cell.border?.right  ?? { style: 'thin', color: { argb: 'FFBFBFBF' } },
      };
    }
  }
}

/* ====================================================================== *
 * Shared header styling — matches the Schedule XLSX aesthetic.           *
 * Bold, centered, thick black bottom border, thin sides/top.             *
 * ====================================================================== */
function applyHeaderRow(sheet: ExcelJSNs.Worksheet, colCount: number): void {
  const row = sheet.getRow(1);
  row.font = { bold: true, size: 11 };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = {
      top:    { style: 'thin',  color: { argb: 'FF000000' } },
      bottom: { style: 'thick', color: { argb: 'FF000000' } },
      left:   { style: 'thin',  color: { argb: 'FF000000' } },
      right:  { style: 'thin',  color: { argb: 'FF000000' } },
    };
  }
}

/* ====================================================================== *
 * Roster XLSX — Schedule-style aesthetic.                                *
 *                                                                        *
 *   Position | MD | WD | XD | WS | MS                                    *
 *                                                                        *
 *  - Bold centered header with thick bottom border                       *
 *  - Each school opens with a merged banner row (grey fill, like the     *
 *    Schedule's warm-up banner)                                          *
 *  - Rank position rows inside each school tinted with alternating rose  *
 *    shades (paletteA / paletteB), matching the Schedule's time groups   *
 *  - Heavy black rule between schools                                    *
 *  - Doubles rendered as "Name1 & Name2"                                 *
 * ====================================================================== */
const EVENT_ORDER_ROSTER = ['MD', 'WD', 'XD', 'WS', 'MS'] as const;
const ROSE_A = 'FFFCE7E7';
const ROSE_B = 'FFF8DCDC';
const BANNER_FILL = 'FFF3F4F6';
const BANNER_FONT = 'FF374151';

function isDoublesPrefix(prefix: string): boolean {
  return prefix.endsWith('D');
}

export async function exportRosterXlsx(
  players: PlayerDTO[],
  groups: RosterGroupDTO[],
  config: TournamentConfig | null,
): Promise<void> {
  if (groups.length === 0) return;

  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tournament Scheduler';
  wb.created = new Date();

  const counts = config?.rankCounts ?? {};
  const events = EVENT_ORDER_ROSTER.filter((p) => (counts[p] ?? 0) > 0);
  const maxRows = Math.max(0, ...events.map((p) => counts[p] ?? 0));

  const sheet = wb.addWorksheet('Roster', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Columns: # | one column per active event.
  sheet.columns = [
    { header: '#', key: 'num', width: 8 },
    ...events.map((ev, i) => ({
      header: `${ev} · ${isDoublesPrefix(ev) ? 'doubles' : 'singles'}`,
      key: `ev${i}`,
      width: 30,
    })),
  ];
  const colCount = events.length + 1;
  applyHeaderRow(sheet, colCount);

  let rowIdx = 2;
  let schoolIndex = 0;
  groups.forEach((g) => {
    // School banner — merged across all columns, grey fill (mirrors the
    // warm-up banner in the Schedule export).
    const bannerRow = sheet.getRow(rowIdx);
    bannerRow.height = 24;
    sheet.mergeCells(rowIdx, 1, rowIdx, colCount);
    const bannerCell = bannerRow.getCell(1);
    bannerCell.value = g.name;
    bannerCell.font = { bold: true, size: 12, color: { argb: BANNER_FONT } };
    bannerCell.alignment = { vertical: 'middle', horizontal: 'center' };
    applyRangeStyle(sheet, rowIdx, rowIdx, 1, colCount, {
      fill: BANNER_FILL,
      thickBottom: false,
    });
    rowIdx++;

    const blockStart = rowIdx;

    // Rank positions: one row per position up to the max of any event.
    const schoolPlayers = players.filter((p) => p.groupId === g.id);
    const byRank = new Map<string, PlayerDTO[]>();
    for (const p of schoolPlayers) {
      for (const r of p.ranks ?? []) {
        if (!byRank.has(r)) byRank.set(r, []);
        byRank.get(r)!.push(p);
      }
    }

    for (let r = 1; r <= maxRows; r++) {
      const row = sheet.getRow(rowIdx);
      row.height = 20;
      row.getCell(1).value = r;

      events.forEach((ev, i) => {
        const col = i + 2;
        const cap = counts[ev] ?? 0;
        if (r > cap) {
          row.getCell(col).value = null;
          return;
        }
        const occupants = byRank.get(`${ev}${r}`) ?? [];
        const names = occupants.map((p) => p.name || '(unnamed)');
        row.getCell(col).value = isDoublesPrefix(ev) ? names.join(' & ') : (names[0] ?? '');
      });

      rowIdx++;
    }

    // Paint the school block in alternating rose — same palette as Schedule
    // groups — with a heavy black rule below to separate schools.
    const tint = schoolIndex % 2 === 0 ? ROSE_A : ROSE_B;
    applyRangeStyle(sheet, blockStart, rowIdx - 1, 1, colCount, {
      fill: tint,
      thickBottom: true,
    });
    schoolIndex++;
  });

  // Column alignment: # centered, event columns left-aligned with indent.
  sheet.getColumn(1).alignment = { vertical: 'middle', horizontal: 'center' };
  for (let i = 0; i < events.length; i++) {
    sheet.getColumn(i + 2).alignment = {
      vertical: 'middle',
      horizontal: 'left',
      indent: 1,
      wrapText: true,
    };
    sheet.getColumn(i + 2).font = { size: 11 };
  }

  const name = `roster_${todayStamp()}.xlsx`;
  await downloadXlsx(name, wb);
}

/* ====================================================================== *
 * Matches XLSX — Schedule-style aesthetic.                               *
 *                                                                        *
 *   # | Event | Side A School | Side A | Side B School | Side B | Dur    *
 *                                                                        *
 *  - Bold centered header with thick bottom border                       *
 *  - Rows grouped by event code (MD, WD, XD, WS, MS)                     *
 *  - Each event block opens with a merged grey banner (the event label), *
 *    mirroring the warm-up banner in Schedule                            *
 *  - Alternating rose row bands per event group                          *
 *  - Heavy black rule between groups                                     *
 *  - Doubles rendered as "Name1 & Name2"                                 *
 * ====================================================================== */
const EVENT_ORDER_MATCHES = ['MS', 'WS', 'MD', 'WD', 'XD'] as const;

function sideNamesAmp(ids: string[] | undefined, playerById: Map<string, PlayerDTO>): string {
  if (!ids || ids.length === 0) return '';
  return ids.map((id) => playerById.get(id)?.name ?? id).join(' & ');
}

function sideSchool(
  ids: string[] | undefined,
  playerById: Map<string, PlayerDTO>,
  schoolById: Map<string, string>,
): string {
  if (!ids || ids.length === 0) return '';
  const unique = new Set(
    ids.map((id) => playerById.get(id)?.groupId).filter((g): g is string => Boolean(g)),
  );
  return [...unique].map((g) => schoolById.get(g) ?? g).join(' / ');
}

function eventPrefix(rank: string | null | undefined): string {
  if (!rank) return '';
  const m = rank.match(/^([A-Z]+)/);
  return m ? m[1] : rank;
}

export async function exportMatchesXlsx(
  matches: MatchDTO[],
  players: PlayerDTO[],
  groups: RosterGroupDTO[],
): Promise<void> {
  if (matches.length === 0) return;

  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tournament Scheduler';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Matches', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: '#',             key: 'num',      width: 6 },
    { header: 'Event',         key: 'event',    width: 10 },
    { header: 'Side A School', key: 'aSchool',  width: 22 },
    { header: 'Side A',        key: 'aPlayers', width: 30 },
    { header: 'Side B School', key: 'bSchool',  width: 22 },
    { header: 'Side B',        key: 'bPlayers', width: 30 },
    { header: 'Duration',      key: 'dur',      width: 10 },
  ];
  const colCount = 7;
  applyHeaderRow(sheet, colCount);

  const playerById = indexById(players);
  const schoolById = new Map(groups.map((g) => [g.id, g.name]));

  // Group by event prefix in the canonical order. Matches with unknown or
  // missing prefixes fall into a trailing "Other" bucket.
  const byEvent = new Map<string, MatchDTO[]>();
  for (const m of matches) {
    const p = eventPrefix(m.eventRank) || 'Other';
    if (!byEvent.has(p)) byEvent.set(p, []);
    byEvent.get(p)!.push(m);
  }
  const orderedPrefixes = [
    ...EVENT_ORDER_MATCHES.filter((p) => byEvent.has(p)),
    ...[...byEvent.keys()].filter(
      (p) => !EVENT_ORDER_MATCHES.includes(p as typeof EVENT_ORDER_MATCHES[number]),
    ),
  ];

  let rowIdx = 2;
  let groupIndex = 0;

  for (const prefix of orderedPrefixes) {
    const bucket = byEvent.get(prefix) ?? [];
    if (bucket.length === 0) continue;

    // Event banner — merged across all columns, grey fill (mirrors warm-up).
    const bannerRow = sheet.getRow(rowIdx);
    bannerRow.height = 24;
    sheet.mergeCells(rowIdx, 1, rowIdx, colCount);
    const bannerCell = bannerRow.getCell(1);
    const isDoubles = prefix.endsWith('D');
    bannerCell.value = `${prefix} · ${isDoubles ? 'doubles' : 'singles'} — ${bucket.length} match${bucket.length === 1 ? '' : 'es'}`;
    bannerCell.font = { bold: true, size: 12, color: { argb: BANNER_FONT } };
    bannerCell.alignment = { vertical: 'middle', horizontal: 'center' };
    applyRangeStyle(sheet, rowIdx, rowIdx, 1, colCount, {
      fill: BANNER_FILL,
      thickBottom: false,
    });
    rowIdx++;

    const blockStart = rowIdx;
    bucket.forEach((m, i) => {
      const row = sheet.getRow(rowIdx);
      row.height = 20;
      row.getCell(1).value = m.matchNumber ?? i + 1;
      row.getCell(2).value = m.eventRank ?? '';
      row.getCell(3).value = sideSchool(m.sideA, playerById, schoolById);
      row.getCell(4).value = sideNamesAmp(m.sideA, playerById);
      row.getCell(5).value = sideSchool(m.sideB, playerById, schoolById);
      row.getCell(6).value = sideNamesAmp(m.sideB, playerById);
      row.getCell(7).value = m.durationSlots;
      rowIdx++;
    });

    const tint = groupIndex % 2 === 0 ? ROSE_A : ROSE_B;
    applyRangeStyle(sheet, blockStart, rowIdx - 1, 1, colCount, {
      fill: tint,
      thickBottom: true,
    });
    groupIndex++;
  }

  // Column alignment.
  sheet.getColumn(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(2).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(3).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(4).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(5).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(6).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getColumn(7).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(4).font = { size: 11 };
  sheet.getColumn(6).font = { size: 11 };

  await downloadXlsx(`matches_${todayStamp()}.xlsx`, wb);
}
