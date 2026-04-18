/**
 * CSV exporters for the three primary data artifacts.
 *
 *   - Roster position grid — per-school sheet with rank-position rows and
 *     event columns (MD / WD / XD / WS / MS). Cell values are player names;
 *     doubles cells read as "Name1 / Name2".
 *   - Match list — flat rows of every match with both sides spelled out.
 *   - Schedule — chronologically sorted assignments with time, court, and
 *     players.
 *
 * All three write plain CSV (comma-separated, RFC 4180 quoting) and a shared
 * `downloadCsv` helper triggers a browser download.
 */
import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  ScheduleAssignment,
  ScheduleDTO,
  TournamentConfig,
} from '../../api/dto';
import { formatSlotTime } from '../../utils/timeUtils';

const EVENT_ORDER = ['MD', 'WD', 'XD', 'WS', 'MS'] as const;

/** Serialise a row of strings to a CSV line, quoting if necessary. */
function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells
    .map((cell) => {
      const s = cell === null || cell === undefined ? '' : String(cell);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(',');
}

/** Trigger a browser download of ``content`` as a file named ``filename``. */
export function downloadCsv(filename: string, content: string): void {
  // Prepend a UTF-8 BOM so Excel opens names with accented characters correctly.
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isDoublesEvent(prefix: string): boolean {
  return prefix.endsWith('D');
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------------- */
/* Roster position grid                                                   */
/* ---------------------------------------------------------------------- */

/**
 * One CSV per school isn't practical in a single download, so this builds a
 * single combined CSV with a blank-line separator between schools. Columns
 * are fixed (MD, WD, XD, WS, MS — in that order) regardless of config so
 * it's easy to stitch back together in a spreadsheet.
 */
export function buildRosterGridCsv(
  players: PlayerDTO[],
  groups: RosterGroupDTO[],
  config: TournamentConfig | null,
): string {
  const counts = config?.rankCounts ?? {};
  const events = EVENT_ORDER.filter((p) => (counts[p] ?? 0) > 0);
  const maxRows = Math.max(0, ...events.map((p) => counts[p] ?? 0));

  const lines: string[] = [];
  for (const g of groups) {
    lines.push(csvRow([g.name]));
    lines.push(csvRow(['#', ...events]));

    const schoolPlayers = players.filter((p) => p.groupId === g.id);
    const byRank = new Map<string, PlayerDTO[]>();
    for (const p of schoolPlayers) {
      for (const r of p.ranks ?? []) {
        if (!byRank.has(r)) byRank.set(r, []);
        byRank.get(r)!.push(p);
      }
    }

    for (let row = 1; row <= maxRows; row++) {
      const cells = [String(row)];
      for (const prefix of events) {
        const rank = `${prefix}${row}`;
        const cap = counts[prefix] ?? 0;
        if (row > cap) {
          cells.push('');
          continue;
        }
        const occupants = byRank.get(rank) ?? [];
        const names = occupants.map((p) => p.name || '(unnamed)');
        // Doubles cells read "Toan Le / Kyle Wong"; singles just the name.
        cells.push(isDoublesEvent(prefix) ? names.join(' / ') : (names[0] ?? ''));
      }
      lines.push(csvRow(cells));
    }
    lines.push(''); // blank separator between schools
  }

  return lines.join('\n');
}

export function exportRosterGrid(
  players: PlayerDTO[],
  groups: RosterGroupDTO[],
  config: TournamentConfig | null,
): void {
  const csv = buildRosterGridCsv(players, groups, config);
  const filename = `roster_${todayStamp()}.csv`;
  downloadCsv(filename, csv);
}

/* ---------------------------------------------------------------------- */
/* Match list                                                             */
/* ---------------------------------------------------------------------- */

export function buildMatchesCsv(
  matches: MatchDTO[],
  players: PlayerDTO[],
  groups: RosterGroupDTO[],
): string {
  const byId = new Map(players.map((p) => [p.id, p]));
  const schoolById = new Map(groups.map((g) => [g.id, g.name]));

  const nameList = (ids: string[]): string =>
    ids
      .map((id) => byId.get(id)?.name ?? id)
      .join(' / ');
  const schoolOf = (ids: string[]): string => {
    const uniq = new Set(ids.map((id) => byId.get(id)?.groupId).filter(Boolean) as string[]);
    return [...uniq].map((gid) => schoolById.get(gid) ?? gid).join(' / ');
  };

  const header = csvRow([
    '#',
    'Event',
    'Side A School',
    'Side A Players',
    'Side B School',
    'Side B Players',
    'Duration Slots',
    'Match ID',
  ]);
  const rows = matches.map((m, i) =>
    csvRow([
      m.matchNumber ?? i + 1,
      m.eventRank ?? '',
      schoolOf(m.sideA),
      nameList(m.sideA),
      schoolOf(m.sideB),
      nameList(m.sideB),
      m.durationSlots,
      m.id,
    ]),
  );
  return [header, ...rows].join('\n');
}

export function exportMatches(
  matches: MatchDTO[],
  players: PlayerDTO[],
  groups: RosterGroupDTO[],
): void {
  const csv = buildMatchesCsv(matches, players, groups);
  downloadCsv(`matches_${todayStamp()}.csv`, csv);
}

/* ---------------------------------------------------------------------- */
/* Schedule                                                               */
/* ---------------------------------------------------------------------- */

export function buildScheduleCsv(
  schedule: ScheduleDTO | null,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig | null,
): string {
  if (!schedule || !config) {
    return csvRow(['Time', 'Court', 'Event', 'Side A', 'Side B']);
  }
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const nameList = (ids: string[] | undefined): string =>
    (ids ?? []).map((id) => playerById.get(id)?.name ?? id).join(' / ');

  const sorted: ScheduleAssignment[] = [...schedule.assignments].sort(
    (a, b) => a.slotId - b.slotId || a.courtId - b.courtId,
  );

  const header = csvRow([
    'Time',
    'End Time',
    'Court',
    'Event',
    'Match #',
    'Side A',
    'Side B',
    'Duration Slots',
    'Match ID',
  ]);
  const rows = sorted.map((a) => {
    const m = matchById.get(a.matchId);
    return csvRow([
      formatSlotTime(a.slotId, config),
      formatSlotTime(a.slotId + a.durationSlots, config),
      a.courtId,
      m?.eventRank ?? '',
      m?.matchNumber ?? '',
      nameList(m?.sideA),
      nameList(m?.sideB),
      a.durationSlots,
      a.matchId,
    ]);
  });
  return [header, ...rows].join('\n');
}

export function exportSchedule(
  schedule: ScheduleDTO | null,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig | null,
): void {
  const csv = buildScheduleCsv(schedule, matches, players, config);
  const name = config?.tournamentDate
    ? `schedule_${sanitizeFilename(config.tournamentDate)}.csv`
    : `schedule_${todayStamp()}.csv`;
  downloadCsv(name, csv);
}
