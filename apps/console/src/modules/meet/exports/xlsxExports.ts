/**
 * Meet roster + matches XLSX exports.
 *
 * The schedule export moved to modules/operations/exports/scheduleXlsx.ts
 * at SP-CONSOLE-4 B4 (Operations owns operating the schedule); the shared
 * plumbing (download, range styling, name joining) lives in
 * lib/xlsxExportShared.
 */
// ExcelJS is large (~400 kB min). Loaded lazily inside each export so it
// never enters the initial bundle.
import type ExcelJSNs from 'exceljs';
import { defaultEventOrder } from '../roster/positionGrid/helpers';
import { indexById } from '../../../lib/indexById';
import { isDoublesCode } from '../../../lib/doubles';
import { useTournamentStore } from '../../../store/tournamentStore';
import { meetMatchIdentityFromStored } from '../../../platform/domain/matchIdentity';
import {
  applyRangeStyle,
  downloadXlsx,
  todayStamp,
} from '../../../lib/xlsxExportShared';
type ExcelJSType = typeof ExcelJSNs;

import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../../api/dto';

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
 *   Position | one column per configured event (MD | WD | XD | WS | MS,  *
 *              then the meet's own events)                               *
 *                                                                        *
 *  - Bold centered header with thick bottom border                       *
 *  - Each school opens with a merged banner row (grey fill, like the     *
 *    Schedule's warm-up banner)                                          *
 *  - Rank position rows inside each school tinted with alternating rose  *
 *    shades (paletteA / paletteB), matching the Schedule's time groups   *
 *  - Heavy black rule between schools                                    *
 *  - Doubles rendered as "Name1 & Name2"                                 *
 * ====================================================================== */
const ROSE_A = 'FFFCE7E7';
const ROSE_B = 'FFF8DCDC';
const BANNER_FILL = 'FFF3F4F6';
const BANNER_FONT = 'FF374151';

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
  // Same derivation the roster grid uses — a meet whose events aren't the five
  // canonical disciplines (U10/U11 …) must still export its columns.
  const events = defaultEventOrder(counts);
  const maxRows = Math.max(0, ...events.map((p) => counts[p] ?? 0));

  const sheet = wb.addWorksheet('Roster', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Columns: # | one column per active event.
  sheet.columns = [
    { header: '#', key: 'num', width: 8 },
    ...events.map((ev, i) => ({
      header: `${ev} · ${isDoublesCode(ev) ? 'doubles' : 'singles'}`,
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
        row.getCell(col).value = isDoublesCode(ev) ? names.join(' & ') : (names[0] ?? '');
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
  ];
  const colCount = 6;
  applyHeaderRow(sheet, colCount);

  const playerById = indexById(players);
  const schoolById = new Map(groups.map((g) => [g.id, g.name]));
  const configuredEventCodes = Object.keys(
    useTournamentStore.getState().config?.rankCounts ?? {},
  );

  // Group by canonical event code in the canonical order. Matches with
  // unknown or missing codes fall into a trailing "Other" bucket.
  const byEvent = new Map<string, MatchDTO[]>();
  for (const m of matches) {
    const { event_code } = meetMatchIdentityFromStored({
      event_rank: m.eventRank,
      configured_event_codes: configuredEventCodes,
    });
    const p = event_code || 'Other';
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
    const isDoubles = isDoublesCode(prefix);
    bannerCell.value = `${prefix} · ${isDoubles ? 'doubles' : 'singles'} · ${bucket.length} match${bucket.length === 1 ? '' : 'es'}`;
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
  sheet.getColumn(4).font = { size: 11 };
  sheet.getColumn(6).font = { size: 11 };

  await downloadXlsx(`matches_${todayStamp()}.xlsx`, wb);
}
