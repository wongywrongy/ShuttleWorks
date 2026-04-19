/**
 * Parse a Schedule XLSX export back into ScheduleAssignment rows.
 *
 * Two recovery modes:
 *
 *   1. schedule-only — the app already has the roster + matches; we just
 *      rebuild schedule.assignments by looking each row's (eventRank,
 *      sideA names, sideB names) up against the existing matches.
 *
 *   2. full-rebuild — the app is empty AND the XLSX contains a Roster
 *      sheet (two-school dual meet). We synthesize groups, players,
 *      matches, and a TournamentConfig from the two sheets together.
 *
 * The export is not changed; this module adapts to its shape as-is. See
 * docs/superpowers/specs/2026-04-19-schedule-xlsx-import-design.md.
 */
import type ExcelJSNs from 'exceljs';
type ExcelJSType = typeof ExcelJSNs;
import { v4 as uuid } from 'uuid';

import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../api/dto';

export interface ImportedAssignment {
  matchId: string;
  slotId: number;
  courtId: number;
  durationSlots: number;
}

export interface ImportWarning {
  row: number;
  timeLabel: string;
  court: string;
  event: string;
  sideA: string;
  sideB: string;
  reason: string;
}

export interface ScheduleOnlyResult {
  mode: 'schedule-only';
  assignments: ImportedAssignment[];
  warnings: ImportWarning[];
  totalRows: number;
}

export interface RebuildPlan {
  config: TournamentConfig;
  groups: RosterGroupDTO[];
  players: PlayerDTO[];
  matches: MatchDTO[];
  assignments: ImportedAssignment[];
  warnings: ImportWarning[];
  totalScheduleRows: number;
  schools: string[];
}

export interface FullRebuildResult {
  mode: 'full-rebuild';
  plan: RebuildPlan;
}

export type ImportResult = ScheduleOnlyResult | FullRebuildResult;

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

function cellString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return String((v as { text?: string })?.text ?? v);
}

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

function hhmmFromMins(mins: number): string {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function splitNames(cell: string): string[] {
  return cell
    .split('&')
    .map((x) => x.trim())
    .filter(Boolean);
}

function nameKey(names: string[]): string {
  return names.map((n) => n.trim().toLowerCase()).filter(Boolean).sort().join('|');
}

async function loadWorkbook(file: File): Promise<ExcelJSNs.Workbook> {
  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb;
}

function findScheduleSheet(wb: ExcelJSNs.Workbook): ExcelJSNs.Worksheet {
  // First sheet whose header row matches the Schedule export.
  for (const sheet of wb.worksheets) {
    const header = sheet.getRow(1);
    if (
      EXPECTED_HEADERS.every(
        (h, i) => normalizeHeader(header.getCell(i + 1).value) === h.toLowerCase(),
      )
    ) {
      return sheet;
    }
  }
  throw new Error(
    `This doesn't look like a Tournament Scheduler schedule export (no sheet has the expected header row)`,
  );
}

/**
 * Find a sheet matching the Roster export's header shape:
 *   Column A is "#" and columns B.. contain event codes with
 *   "· doubles" / "· singles" suffixes.
 */
function findRosterSheet(wb: ExcelJSNs.Workbook): ExcelJSNs.Worksheet | null {
  for (const sheet of wb.worksheets) {
    const header = sheet.getRow(1);
    if (normalizeHeader(header.getCell(1).value) !== '#') continue;
    const second = cellString(header.getCell(2).value).toLowerCase();
    if (second.includes('doubles') || second.includes('singles')) return sheet;
  }
  return null;
}

interface ScheduleParse {
  sheet: ExcelJSNs.Worksheet;
  rows: Array<{
    r: number;
    timeLabel: string;
    mins: number;
    court: number;
    event: string;
    sideAText: string;
    sideBText: string;
  }>;
  warmupTimeLabel: string | null;
}

function readScheduleRows(sheet: ExcelJSNs.Worksheet): ScheduleParse {
  const rows: ScheduleParse['rows'] = [];
  const last = sheet.actualRowCount ?? sheet.rowCount ?? 1;
  let warmupTimeLabel: string | null = null;

  for (let r = 2; r <= last; r++) {
    const row = sheet.getRow(r);
    const sideA = cellString(row.getCell(6).value);
    const sideB = cellString(row.getCell(7).value);
    const timeLabel = cellString(row.getCell(1).value);

    if (sideA.trim().toLowerCase() === 'warm up') {
      if (warmupTimeLabel == null && timeLabel) warmupTimeLabel = timeLabel;
      continue;
    }

    const courtRaw = row.getCell(2).value;
    const event = cellString(row.getCell(5).value);

    if (!timeLabel && courtRaw == null && !event && !sideA && !sideB) continue;

    const mins = parseAmPm(timeLabel);
    if (mins == null) continue; // skipped silently; warnings are generated downstream

    const court = typeof courtRaw === 'number' ? courtRaw : parseInt(String(courtRaw ?? ''), 10);
    if (!Number.isInteger(court) || court <= 0) continue;

    rows.push({ r, timeLabel, mins, court, event, sideAText: sideA, sideBText: sideB });
  }

  return { sheet, rows, warmupTimeLabel };
}

// ---------- schedule-only mode -------------------------------------------

export async function parseScheduleOnly(
  file: File,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig,
): Promise<ScheduleOnlyResult> {
  const wb = await loadWorkbook(file);
  const sheet = findScheduleSheet(wb);
  const { rows } = readScheduleRows(sheet);

  const playerNameById = new Map(players.map((p) => [p.id, p.name ?? '']));
  const keyFromIds = (ids: string[] | undefined): string =>
    nameKey((ids ?? []).map((id) => playerNameById.get(id) ?? ''));

  const matchByKey = new Map<string, MatchDTO[]>();
  const addKey = (k: string, m: MatchDTO) => {
    const arr = matchByKey.get(k);
    if (arr) arr.push(m);
    else matchByKey.set(k, [m]);
  };
  for (const m of matches) {
    const ev = (m.eventRank ?? '').trim();
    if (!ev) continue;
    const ka = keyFromIds(m.sideA);
    const kb = keyFromIds(m.sideB);
    if (!ka || !kb) continue;
    addKey(`${ev}::${ka}::${kb}`, m);
    addKey(`${ev}::${kb}::${ka}`, m);
  }

  const [dh, dm] = config.dayStart.split(':').map((x) => parseInt(x, 10));
  const dayStartMin = dh * 60 + (dm || 0);
  const interval = config.intervalMinutes;

  const assignments: ImportedAssignment[] = [];
  const warnings: ImportWarning[] = [];
  const seen = new Set<string>();
  let totalRows = 0;

  for (const row of rows) {
    totalRows++;
    const push = (reason: string) =>
      warnings.push({
        row: row.r,
        timeLabel: row.timeLabel,
        court: String(row.court),
        event: row.event,
        sideA: row.sideAText,
        sideB: row.sideBText,
        reason,
      });

    if (!row.event || (!row.sideAText && !row.sideBText)) {
      push('incomplete row');
      continue;
    }

    const delta = row.mins - dayStartMin;
    if (delta < 0 || delta % interval !== 0) {
      push('time not on interval boundary');
      continue;
    }
    const slotId = delta / interval;

    if (row.court > config.courtCount) {
      push('court out of range');
      continue;
    }

    const key = `${row.event}::${nameKey(splitNames(row.sideAText))}::${nameKey(splitNames(row.sideBText))}`;
    const candidates = matchByKey.get(key) ?? [];
    const ids = new Set(candidates.map((m) => m.id));
    if (ids.size === 0) {
      push('no matching match');
      continue;
    }
    if (ids.size > 1) {
      push(`ambiguous: ${ids.size} candidates`);
      continue;
    }
    const matchId = [...ids][0];
    if (seen.has(matchId)) {
      push('duplicate assignment for match');
      continue;
    }
    seen.add(matchId);

    const match = candidates.find((m) => m.id === matchId)!;
    assignments.push({
      matchId,
      slotId,
      courtId: row.court,
      durationSlots: match.durationSlots ?? 1,
    });
  }

  return { mode: 'schedule-only', assignments, warnings, totalRows };
}

// ---------- full-rebuild mode --------------------------------------------

interface RosterParse {
  schools: string[];               // display names in banner order
  eventCodes: string[];            // stripped event codes per column, header order (e.g. ["MD","WD","XD","WS","MS"])
  eventIsDoubles: boolean[];       // aligned with eventCodes
  // per-school, per-event, per-position: raw cell text
  cells: Array<Array<Array<string>>>;  // [schoolIdx][eventIdx][positionIdx] = names
}

function parseRosterSheet(sheet: ExcelJSNs.Worksheet): RosterParse {
  const header = sheet.getRow(1);
  const eventCodes: string[] = [];
  const eventIsDoubles: boolean[] = [];
  // columns 2..N are events
  const maxCol = sheet.actualColumnCount ?? sheet.columnCount ?? 6;
  for (let c = 2; c <= maxCol; c++) {
    const v = cellString(header.getCell(c).value);
    if (!v) break;
    // Strip " · doubles" / "· singles" / "- doubles" / etc.
    const codeMatch = /^([A-Za-z]+)/.exec(v);
    if (!codeMatch) continue;
    eventCodes.push(codeMatch[1].toUpperCase());
    eventIsDoubles.push(/doubles/i.test(v));
  }

  // Walk rows: banner rows = first-cell is a non-empty string with no other
  // content in the row OR the row spans a merged range across all columns.
  // Simpler heuristic: first cell is a non-numeric non-empty string — that's a school banner.
  const schools: string[] = [];
  const cells: Array<Array<Array<string>>> = [];
  let currentSchool = -1;

  const last = sheet.actualRowCount ?? sheet.rowCount ?? 1;
  for (let r = 2; r <= last; r++) {
    const row = sheet.getRow(r);
    const first = row.getCell(1).value;
    if (first == null || first === '') continue;

    if (typeof first === 'string') {
      const t = first.trim();
      if (!t) continue;
      if (/^\d+$/.test(t)) {
        // position row where first column was stored as a string
        if (currentSchool < 0) continue;
        const positionIdx = parseInt(t, 10) - 1;
        for (let ei = 0; ei < eventCodes.length; ei++) {
          const cell = cellString(row.getCell(ei + 2).value);
          if (!cells[currentSchool][ei]) cells[currentSchool][ei] = [];
          cells[currentSchool][ei][positionIdx] = cell;
        }
        continue;
      }
      // Banner
      schools.push(t);
      currentSchool = schools.length - 1;
      cells.push(eventCodes.map(() => []));
      continue;
    }

    if (typeof first === 'number') {
      if (currentSchool < 0) continue;
      const positionIdx = Math.round(first) - 1;
      for (let ei = 0; ei < eventCodes.length; ei++) {
        const cell = cellString(row.getCell(ei + 2).value);
        if (!cells[currentSchool][ei]) cells[currentSchool][ei] = [];
        cells[currentSchool][ei][positionIdx] = cell;
      }
    }
  }

  return { schools, eventCodes, eventIsDoubles, cells };
}

function inferConfig(schedule: ScheduleParse, courtMax: number): TournamentConfig {
  // Unique time labels in the schedule, ordered by minutes of day.
  const uniqueMins = [...new Set(schedule.rows.map((r) => r.mins))].sort((a, b) => a - b);

  // intervalMinutes: GCD of deltas between consecutive distinct times; fall back to 30.
  let interval = 30;
  if (uniqueMins.length >= 2) {
    let g = uniqueMins[1] - uniqueMins[0];
    for (let i = 2; i < uniqueMins.length; i++) g = gcd(g, uniqueMins[i] - uniqueMins[i - 1]);
    if (g > 0) interval = g;
  }

  // dayStart: warm-up label if present (export writes first_match - 30 min),
  // else the first match time.
  const warmupMins = schedule.warmupTimeLabel ? parseAmPm(schedule.warmupTimeLabel) : null;
  const dayStartMin = warmupMins ?? (uniqueMins[0] ?? 9 * 60);

  // dayEnd: last match + interval (so the last match has a full block).
  const lastMatchMin = uniqueMins.length ? uniqueMins[uniqueMins.length - 1] : dayStartMin;
  const dayEndMin = lastMatchMin + interval;

  return {
    intervalMinutes: interval,
    dayStart: hhmmFromMins(dayStartMin),
    dayEnd: hhmmFromMins(dayEndMin),
    breaks: [],
    courtCount: courtMax,
    defaultRestMinutes: 30,
    freezeHorizonSlots: 0,
    rankCounts: {},
  };
}

export async function parseFullRebuild(file: File): Promise<RebuildPlan | null> {
  const wb = await loadWorkbook(file);
  const scheduleSheet = findScheduleSheet(wb);
  const rosterSheet = findRosterSheet(wb);
  if (!rosterSheet) return null;

  const roster = parseRosterSheet(rosterSheet);
  if (roster.schools.length < 2) return null;
  if (roster.schools.length > 2) {
    throw new Error(
      `Rebuild from Roster sheet: only two-school dual meets are supported (found ${roster.schools.length} schools).`,
    );
  }

  // --- Synthesize groups + players + matches from the roster -----------
  const groups: RosterGroupDTO[] = roster.schools.map((name) => ({ id: uuid(), name }));
  const players: PlayerDTO[] = [];
  // De-dupe players by (schoolIdx, lowercased name).
  const playerIdByKey = new Map<string, string>();

  const ensurePlayer = (schoolIdx: number, name: string): string => {
    const k = `${schoolIdx}::${name.trim().toLowerCase()}`;
    const existing = playerIdByKey.get(k);
    if (existing) return existing;
    const id = uuid();
    playerIdByKey.set(k, id);
    players.push({
      id,
      name: name.trim(),
      groupId: groups[schoolIdx].id,
      ranks: [],
      availability: [],
    });
    return id;
  };

  const rankCounts: Record<string, number> = {};
  const matches: MatchDTO[] = [];

  for (let ei = 0; ei < roster.eventCodes.length; ei++) {
    const ev = roster.eventCodes[ei];
    const maxPos = Math.max(
      ...roster.cells.map((bySchool) => (bySchool[ei] ?? []).length),
      0,
    );
    if (maxPos === 0) continue;
    rankCounts[ev] = maxPos;

    for (let pos = 0; pos < maxPos; pos++) {
      const eventRank = `${ev}${pos + 1}`;
      const aNames = splitNames(roster.cells[0]?.[ei]?.[pos] ?? '');
      const bNames = splitNames(roster.cells[1]?.[ei]?.[pos] ?? '');

      // Record ranks for every occupant, whether or not the position has an opponent.
      for (const n of aNames) {
        const id = ensurePlayer(0, n);
        const p = players.find((pp) => pp.id === id)!;
        if (!p.ranks!.includes(eventRank)) p.ranks!.push(eventRank);
      }
      for (const n of bNames) {
        const id = ensurePlayer(1, n);
        const p = players.find((pp) => pp.id === id)!;
        if (!p.ranks!.includes(eventRank)) p.ranks!.push(eventRank);
      }

      if (aNames.length === 0 || bNames.length === 0) continue; // no opponent → no match

      const sideAIds = aNames.map((n) => ensurePlayer(0, n));
      const sideBIds = bNames.map((n) => ensurePlayer(1, n));

      matches.push({
        id: uuid(),
        matchNumber: matches.length + 1,
        sideA: sideAIds,
        sideB: sideBIds,
        eventRank,
        eventCode: eventRank,
        durationSlots: 1,
        matchType: 'dual',
      });
    }
  }

  // --- Walk the schedule sheet to build assignments + config -----------
  const scheduleParse = readScheduleRows(scheduleSheet);
  const courtMax = scheduleParse.rows.reduce((m, r) => Math.max(m, r.court), 1);
  const config = inferConfig(scheduleParse, courtMax);
  config.rankCounts = rankCounts;

  // Match lookup by (event + sorted name key).
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const matchByKey = new Map<string, MatchDTO[]>();
  const addKey = (k: string, m: MatchDTO) => {
    const arr = matchByKey.get(k);
    if (arr) arr.push(m);
    else matchByKey.set(k, [m]);
  };
  for (const m of matches) {
    const ka = nameKey(m.sideA.map((id) => playerNameById.get(id) ?? ''));
    const kb = nameKey(m.sideB.map((id) => playerNameById.get(id) ?? ''));
    if (!ka || !kb) continue;
    addKey(`${m.eventRank}::${ka}::${kb}`, m);
    addKey(`${m.eventRank}::${kb}::${ka}`, m);
  }

  const [dh, dm] = config.dayStart.split(':').map((x) => parseInt(x, 10));
  const dayStartMin = dh * 60 + (dm || 0);
  const assignments: ImportedAssignment[] = [];
  const warnings: ImportWarning[] = [];
  const seen = new Set<string>();

  for (const row of scheduleParse.rows) {
    const push = (reason: string) =>
      warnings.push({
        row: row.r,
        timeLabel: row.timeLabel,
        court: String(row.court),
        event: row.event,
        sideA: row.sideAText,
        sideB: row.sideBText,
        reason,
      });

    if (!row.event || (!row.sideAText && !row.sideBText)) {
      push('incomplete row');
      continue;
    }

    const delta = row.mins - dayStartMin;
    if (delta < 0 || delta % config.intervalMinutes !== 0) {
      push('time not on interval boundary');
      continue;
    }
    const slotId = delta / config.intervalMinutes;

    const key = `${row.event}::${nameKey(splitNames(row.sideAText))}::${nameKey(splitNames(row.sideBText))}`;
    const candidates = matchByKey.get(key) ?? [];
    const ids = new Set(candidates.map((m) => m.id));
    if (ids.size === 0) {
      push('no matching match');
      continue;
    }
    if (ids.size > 1) {
      push(`ambiguous: ${ids.size} candidates`);
      continue;
    }
    const matchId = [...ids][0];
    if (seen.has(matchId)) {
      push('duplicate assignment for match');
      continue;
    }
    seen.add(matchId);
    assignments.push({ matchId, slotId, courtId: row.court, durationSlots: 1 });
  }

  return {
    config,
    groups,
    players,
    matches,
    assignments,
    warnings,
    totalScheduleRows: scheduleParse.rows.length,
    schools: roster.schools,
  };
}

// ---------- public entrypoint --------------------------------------------

/**
 * Decide which mode to run based on the current app state.
 *
 *   - app has matches → schedule-only
 *   - app is empty AND xlsx has a roster sheet → full-rebuild
 *   - app is empty AND xlsx has no roster sheet → error the caller translates
 */
export async function parseScheduleXlsx(
  file: File,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig | null,
): Promise<ImportResult> {
  if (matches.length > 0 && config) {
    return parseScheduleOnly(file, matches, players, config);
  }
  const plan = await parseFullRebuild(file);
  if (!plan) {
    throw new Error(
      `App is empty and this XLSX has no Roster sheet. Load a roster (or a different XLSX) first.`,
    );
  }
  return { mode: 'full-rebuild', plan };
}
