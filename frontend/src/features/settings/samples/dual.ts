/**
 * Dual-meet sample tournament — 2 schools × 20 players × 15 matches.
 *
 * Hand-curated so a fresh user can click "Load Dual demo" and
 * immediately have a working schedule to poke at. Pre-baked schedule
 * means the solver doesn't have to run on first load. IDs are stable
 * (``dual-*`` prefix) so re-loading the demo is idempotent.
 *
 * Shape:
 *   • 2 schools (A vs B)
 *   • 20 players per school = 40 total (10 men + 10 women each)
 *   • 5 events × 3 ladder positions per pairing = 15 matches
 *   • 6 courts × 3 slots = 18 cells (15 used)
 *   • Reserves (p08-p10 / p18-p20 per school) intentionally rostered
 *     but unranked so the demo also exercises the "registered but not
 *     playing today" UI state.
 */
import type {
  TournamentConfig,
  RosterGroupDTO,
  PlayerDTO,
  MatchDTO,
  ScheduleDTO,
} from '../../../api/dto';

export interface DemoFixture {
  config: TournamentConfig;
  groups: RosterGroupDTO[];
  players: PlayerDTO[];
  matches: MatchDTO[];
  schedule: ScheduleDTO;
}

const SCHOOLS: RosterGroupDTO[] = [
  { id: 'dual-school-a', name: 'Northwood Eagles', metadata: { color: '#2563eb' } },
  { id: 'dual-school-b', name: 'Riverside Hawks',  metadata: { color: '#059669' } },
];

// 20 players per school. Men ``p01-p10`` / women ``p11-p20`` for A,
// ``p21-p30`` / ``p31-p40`` for B. Ranks fill 3-position ladders for
// MS/WS/MD/WD/XD; trailing IDs sit unranked as bench.
const PLAYERS: PlayerDTO[] = [
  // Northwood Eagles · men
  { id: 'dual-p01', name: 'Alex Chen',       groupId: 'dual-school-a', ranks: ['MS1', 'MD1', 'XD1'], availability: [] },
  { id: 'dual-p02', name: 'Ben Park',        groupId: 'dual-school-a', ranks: ['MS2', 'MD1'],         availability: [] },
  { id: 'dual-p03', name: 'Carlos Singh',    groupId: 'dual-school-a', ranks: ['MS3', 'MD2'],         availability: [] },
  { id: 'dual-p04', name: 'David Lee',       groupId: 'dual-school-a', ranks: ['MD2'],                availability: [] },
  { id: 'dual-p05', name: 'Ethan Patel',     groupId: 'dual-school-a', ranks: ['MD3', 'XD2'],         availability: [] },
  { id: 'dual-p06', name: 'Felix Nakamura',  groupId: 'dual-school-a', ranks: ['MD3'],                availability: [] },
  { id: 'dual-p07', name: 'Gabe Diaz',       groupId: 'dual-school-a', ranks: ['XD3'],                availability: [] },
  { id: 'dual-p08', name: 'Henry Vance',     groupId: 'dual-school-a', ranks: [],                     availability: [] },
  { id: 'dual-p09', name: 'Ian Costa',       groupId: 'dual-school-a', ranks: [],                     availability: [] },
  { id: 'dual-p10', name: 'Jaden Tanaka',    groupId: 'dual-school-a', ranks: [],                     availability: [] },
  // Northwood Eagles · women
  { id: 'dual-p11', name: 'Anna Bryant',     groupId: 'dual-school-a', ranks: ['WS1', 'WD1', 'XD1'], availability: [] },
  { id: 'dual-p12', name: 'Beth Reyes',      groupId: 'dual-school-a', ranks: ['WS2', 'WD1'],         availability: [] },
  { id: 'dual-p13', name: 'Cara Murphy',     groupId: 'dual-school-a', ranks: ['WS3', 'WD2'],         availability: [] },
  { id: 'dual-p14', name: 'Diana Quinn',     groupId: 'dual-school-a', ranks: ['WD2'],                availability: [] },
  { id: 'dual-p15', name: 'Elena Hale',      groupId: 'dual-school-a', ranks: ['WD3', 'XD2'],         availability: [] },
  { id: 'dual-p16', name: 'Fiona Olsen',     groupId: 'dual-school-a', ranks: ['WD3'],                availability: [] },
  { id: 'dual-p17', name: 'Grace Tan',       groupId: 'dual-school-a', ranks: ['XD3'],                availability: [] },
  { id: 'dual-p18', name: 'Hannah Pryor',    groupId: 'dual-school-a', ranks: [],                     availability: [] },
  { id: 'dual-p19', name: 'Iris Olin',       groupId: 'dual-school-a', ranks: [],                     availability: [] },
  { id: 'dual-p20', name: 'Jane Brooks',     groupId: 'dual-school-a', ranks: [],                     availability: [] },
  // Riverside Hawks · men
  { id: 'dual-p21', name: 'Marcus Wei',      groupId: 'dual-school-b', ranks: ['MS1', 'MD1', 'XD1'], availability: [] },
  { id: 'dual-p22', name: 'Noah Park',       groupId: 'dual-school-b', ranks: ['MS2', 'MD1'],         availability: [] },
  { id: 'dual-p23', name: 'Owen Brooks',     groupId: 'dual-school-b', ranks: ['MS3', 'MD2'],         availability: [] },
  { id: 'dual-p24', name: 'Asher Cho',       groupId: 'dual-school-b', ranks: ['MD2'],                availability: [] },
  { id: 'dual-p25', name: 'Ezra Tran',       groupId: 'dual-school-b', ranks: ['MD3', 'XD2'],         availability: [] },
  { id: 'dual-p26', name: 'Caleb Hsu',       groupId: 'dual-school-b', ranks: ['MD3'],                availability: [] },
  { id: 'dual-p27', name: 'Liam Voss',       groupId: 'dual-school-b', ranks: ['XD3'],                availability: [] },
  { id: 'dual-p28', name: 'Mateo Kim',       groupId: 'dual-school-b', ranks: [],                     availability: [] },
  { id: 'dual-p29', name: 'Theo Lin',        groupId: 'dual-school-b', ranks: [],                     availability: [] },
  { id: 'dual-p30', name: 'Eli Park',        groupId: 'dual-school-b', ranks: [],                     availability: [] },
  // Riverside Hawks · women
  { id: 'dual-p31', name: 'Maya Wei',        groupId: 'dual-school-b', ranks: ['WS1', 'WD1', 'XD1'], availability: [] },
  { id: 'dual-p32', name: 'Zara Park',       groupId: 'dual-school-b', ranks: ['WS2', 'WD1'],         availability: [] },
  { id: 'dual-p33', name: 'Nora Brooks',     groupId: 'dual-school-b', ranks: ['WS3', 'WD2'],         availability: [] },
  { id: 'dual-p34', name: 'Ivy Cho',         groupId: 'dual-school-b', ranks: ['WD2'],                availability: [] },
  { id: 'dual-p35', name: 'Ada Tran',        groupId: 'dual-school-b', ranks: ['WD3', 'XD2'],         availability: [] },
  { id: 'dual-p36', name: 'Esme Hsu',        groupId: 'dual-school-b', ranks: ['WD3'],                availability: [] },
  { id: 'dual-p37', name: 'Layla Voss',      groupId: 'dual-school-b', ranks: ['XD3'],                availability: [] },
  { id: 'dual-p38', name: 'Mira Kim',        groupId: 'dual-school-b', ranks: [],                     availability: [] },
  { id: 'dual-p39', name: 'Stella Lin',      groupId: 'dual-school-b', ranks: [],                     availability: [] },
  { id: 'dual-p40', name: 'Eva Park',        groupId: 'dual-school-b', ranks: [],                     availability: [] },
];

// 15 matches — single A vs B pairing × 5 events × 3 ladder positions.
// Side ordering matches the ladder position so identical ranks meet
// (MS1 vs MS1, etc).
const MATCHES: MatchDTO[] = [
  // Singles
  { id: 'dual-m01', matchNumber: 1,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['dual-p01'], sideB: ['dual-p21'] },
  { id: 'dual-m02', matchNumber: 2,  matchType: 'dual', eventRank: 'MS2', durationSlots: 1, sideA: ['dual-p02'], sideB: ['dual-p22'] },
  { id: 'dual-m03', matchNumber: 3,  matchType: 'dual', eventRank: 'MS3', durationSlots: 1, sideA: ['dual-p03'], sideB: ['dual-p23'] },
  { id: 'dual-m04', matchNumber: 4,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['dual-p11'], sideB: ['dual-p31'] },
  { id: 'dual-m05', matchNumber: 5,  matchType: 'dual', eventRank: 'WS2', durationSlots: 1, sideA: ['dual-p12'], sideB: ['dual-p32'] },
  { id: 'dual-m06', matchNumber: 6,  matchType: 'dual', eventRank: 'WS3', durationSlots: 1, sideA: ['dual-p13'], sideB: ['dual-p33'] },
  // Doubles
  { id: 'dual-m07', matchNumber: 7,  matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['dual-p01', 'dual-p02'], sideB: ['dual-p21', 'dual-p22'] },
  { id: 'dual-m08', matchNumber: 8,  matchType: 'dual', eventRank: 'MD2', durationSlots: 1, sideA: ['dual-p03', 'dual-p04'], sideB: ['dual-p23', 'dual-p24'] },
  { id: 'dual-m09', matchNumber: 9,  matchType: 'dual', eventRank: 'MD3', durationSlots: 1, sideA: ['dual-p05', 'dual-p06'], sideB: ['dual-p25', 'dual-p26'] },
  { id: 'dual-m10', matchNumber: 10, matchType: 'dual', eventRank: 'WD1', durationSlots: 1, sideA: ['dual-p11', 'dual-p12'], sideB: ['dual-p31', 'dual-p32'] },
  { id: 'dual-m11', matchNumber: 11, matchType: 'dual', eventRank: 'WD2', durationSlots: 1, sideA: ['dual-p13', 'dual-p14'], sideB: ['dual-p33', 'dual-p34'] },
  { id: 'dual-m12', matchNumber: 12, matchType: 'dual', eventRank: 'WD3', durationSlots: 1, sideA: ['dual-p15', 'dual-p16'], sideB: ['dual-p35', 'dual-p36'] },
  // Mixed doubles
  { id: 'dual-m13', matchNumber: 13, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['dual-p01', 'dual-p11'], sideB: ['dual-p21', 'dual-p31'] },
  { id: 'dual-m14', matchNumber: 14, matchType: 'dual', eventRank: 'XD2', durationSlots: 1, sideA: ['dual-p05', 'dual-p15'], sideB: ['dual-p25', 'dual-p35'] },
  { id: 'dual-m15', matchNumber: 15, matchType: 'dual', eventRank: 'XD3', durationSlots: 1, sideA: ['dual-p07', 'dual-p17'], sideB: ['dual-p27', 'dual-p37'] },
];

// Schedule layout:
//   slot 0 → singles (courts 1-6)
//   slot 1 → doubles (courts 1-6)
//   slot 2 → mixed   (courts 1-3)
// Bands keep player overlap clean: every singles player rests during
// the doubles slot, every doubles-only player rests during XD.
const SCHEDULE: ScheduleDTO = {
  status: 'optimal',
  assignments: [
    { matchId: 'dual-m01', slotId: 0, courtId: 1, durationSlots: 1 },
    { matchId: 'dual-m02', slotId: 0, courtId: 2, durationSlots: 1 },
    { matchId: 'dual-m03', slotId: 0, courtId: 3, durationSlots: 1 },
    { matchId: 'dual-m04', slotId: 0, courtId: 4, durationSlots: 1 },
    { matchId: 'dual-m05', slotId: 0, courtId: 5, durationSlots: 1 },
    { matchId: 'dual-m06', slotId: 0, courtId: 6, durationSlots: 1 },
    { matchId: 'dual-m07', slotId: 1, courtId: 1, durationSlots: 1 },
    { matchId: 'dual-m08', slotId: 1, courtId: 2, durationSlots: 1 },
    { matchId: 'dual-m09', slotId: 1, courtId: 3, durationSlots: 1 },
    { matchId: 'dual-m10', slotId: 1, courtId: 4, durationSlots: 1 },
    { matchId: 'dual-m11', slotId: 1, courtId: 5, durationSlots: 1 },
    { matchId: 'dual-m12', slotId: 1, courtId: 6, durationSlots: 1 },
    { matchId: 'dual-m13', slotId: 2, courtId: 1, durationSlots: 1 },
    { matchId: 'dual-m14', slotId: 2, courtId: 2, durationSlots: 1 },
    { matchId: 'dual-m15', slotId: 2, courtId: 3, durationSlots: 1 },
  ],
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: 0,
  infeasibleReasons: [],
};

export const DUAL_DEMO: DemoFixture = {
  config: {
    tournamentName: 'Northwood Spring Open',
    meetMode: 'dual',
    intervalMinutes: 30,
    dayStart: '09:00',
    dayEnd: '11:00',
    breaks: [],
    courtCount: 6,
    // Top-ranked players intentionally appear in back-to-back bands
    // (singles → doubles → mixed) so the demo shows the "stacked
    // player" UI state. Required rest is therefore 0 — the operator
    // can crank it back up in Setup once they understand the layout.
    defaultRestMinutes: 0,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 3, WS: 3, MD: 3, WD: 3, XD: 3 },
  },
  groups: SCHOOLS,
  players: PLAYERS,
  matches: MATCHES,
  schedule: SCHEDULE,
};
