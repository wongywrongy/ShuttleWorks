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

  // --- Warm-up detection ----------------------------------------------
  // The export merges F:G across the warmup block and writes "Warm up".
  // Collect those row numbers and skip them in the main loop.
  const warmupRows = new Set<number>();
  const mergedRanges: string[] = [];
  const rawMerges = (sheet as unknown as { _merges?: Record<string, unknown> })._merges;
  if (rawMerges) {
    for (const key of Object.keys(rawMerges)) {
      const val = rawMerges[key];
      mergedRanges.push(typeof val === 'string' ? val : String(key));
    }
  }
  for (const addr of mergedRanges) {
    const m = /^F(\d+):G(\d+)$/.exec(addr);
    if (!m) continue;
    const r1 = Number(m[1]);
    const r2 = Number(m[2]);
    const top = sheet.getCell(`F${r1}`).value;
    if (typeof top === 'string' && top.trim().toLowerCase() === 'warm up') {
      for (let r = r1; r <= r2; r++) warmupRows.add(r);
    }
  }

  // --- Build match lookup keys ----------------------------------------
  const playerNameById = new Map(players.map((p) => [p.id, p.name ?? '']));
  const nameKey = (ids: string[] | undefined): string =>
    (ids ?? [])
      .map((id) => (playerNameById.get(id) ?? '').trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|');

  // key = `${eventRank}::${sideA}::${sideB}`. We also insert a second
  // entry with A/B swapped so exporter's side-order choice never breaks
  // resolution.
  const matchByKey = new Map<string, MatchDTO[]>();
  const addKey = (k: string, m: MatchDTO) => {
    const arr = matchByKey.get(k);
    if (arr) arr.push(m);
    else matchByKey.set(k, [m]);
  };
  for (const m of matches) {
    const ev = (m.eventRank ?? '').trim();
    if (!ev) continue;
    const ka = nameKey(m.sideA);
    const kb = nameKey(m.sideB);
    if (!ka || !kb) continue;
    addKey(`${ev}::${ka}::${kb}`, m);
    addKey(`${ev}::${kb}::${ka}`, m);
  }

  // --- Time parsing ---------------------------------------------------
  const [dh, dm] = config.dayStart.split(':').map((x) => parseInt(x, 10));
  const dayStartMin = dh * 60 + (dm || 0);
  const interval = config.intervalMinutes;

  function parseAmPm(s: string): number | null {
    const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(s);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const pm = m[3].toUpperCase() === 'PM';
    if (h === 12) h = 0;
    if (pm) h += 12;
    return h * 60 + mm;
  }

  function splitSide(s: string): string[] {
    return s
      .split('&')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .sort();
  }

  // --- Main row loop --------------------------------------------------
  const assignments: ImportedAssignment[] = [];
  const warnings: ImportWarning[] = [];
  const seenMatchIds = new Set<string>();
  let totalRows = 0;

  const lastRow = sheet.actualRowCount ?? sheet.rowCount ?? 1;
  for (let r = 2; r <= lastRow; r++) {
    if (warmupRows.has(r)) continue;
    const row = sheet.getRow(r);
    const timeLabel = String(row.getCell(1).value ?? '').trim();
    const courtRaw = row.getCell(2).value;
    const event = String(row.getCell(5).value ?? '').trim();
    const sideA = String(row.getCell(6).value ?? '').trim();
    const sideB = String(row.getCell(7).value ?? '').trim();

    // Skip structurally-empty rows (blank separators, etc.)
    if (!timeLabel && !courtRaw && !event && !sideA && !sideB) continue;

    totalRows++;
    const push = (reason: string) =>
      warnings.push({ row: r, timeLabel, court: String(courtRaw ?? ''), event, sideA, sideB, reason });

    if (!timeLabel || courtRaw == null || courtRaw === '' || !event || (!sideA && !sideB)) {
      push('incomplete row');
      continue;
    }

    const mins = parseAmPm(timeLabel);
    if (mins === null) {
      push('unparseable time');
      continue;
    }
    const delta = mins - dayStartMin;
    if (delta < 0 || delta % interval !== 0) {
      push('time not on interval boundary');
      continue;
    }
    const slotId = delta / interval;

    const courtId = typeof courtRaw === 'number' ? courtRaw : parseInt(String(courtRaw), 10);
    if (!Number.isInteger(courtId) || courtId <= 0 || courtId > config.courtCount) {
      push('court out of range');
      continue;
    }

    const key = `${event}::${splitSide(sideA).join('|')}::${splitSide(sideB).join('|')}`;
    const candidates = matchByKey.get(key) ?? [];
    const uniqueIds = new Set(candidates.map((m) => m.id));
    if (uniqueIds.size === 0) {
      push('no matching match');
      continue;
    }
    if (uniqueIds.size > 1) {
      push(`ambiguous: ${uniqueIds.size} candidates`);
      continue;
    }
    const matchId = [...uniqueIds][0];
    if (seenMatchIds.has(matchId)) {
      push('duplicate assignment for match');
      continue;
    }
    seenMatchIds.add(matchId);

    const match = candidates.find((m) => m.id === matchId)!;
    assignments.push({
      matchId,
      slotId,
      courtId,
      durationSlots: match.durationSlots ?? 1,
    });
  }

  return { assignments, warnings, totalRows };
}
