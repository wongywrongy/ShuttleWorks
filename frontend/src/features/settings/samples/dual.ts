/**
 * Dual-meet sample tournament — 4 schools × 4 players × 24 matches.
 *
 * Hand-curated so a fresh user can click "Load Dual Demo" and
 * immediately have a working schedule to poke at. Pre-baked schedule
 * means the solver doesn't have to run on first load. IDs are stable
 * (dual-* prefix) so re-loading the demo is idempotent.
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
  { id: 'dual-school-c', name: 'Highland Wolves',  metadata: { color: '#d97706' } },
  { id: 'dual-school-d', name: 'Westgate Falcons', metadata: { color: '#7c3aed' } },
];

// 4 players per school × 4 schools = 16 players. Each gets a couple of
// rank assignments so events can be filled by the auto-generator.
const PLAYERS: PlayerDTO[] = [
  // Northwood
  { id: 'dual-p01', name: 'Alex Chen',     groupId: 'dual-school-a', ranks: ['MS1', 'MD1'], availability: [] },
  { id: 'dual-p02', name: 'Jamie Park',    groupId: 'dual-school-a', ranks: ['MS2', 'MD1'], availability: [] },
  { id: 'dual-p03', name: 'Riley Singh',   groupId: 'dual-school-a', ranks: ['WS1', 'WD1', 'XD1'], availability: [] },
  { id: 'dual-p04', name: 'Morgan Lee',    groupId: 'dual-school-a', ranks: ['WS2', 'WD1', 'XD2'], availability: [] },
  // Riverside
  { id: 'dual-p05', name: 'Casey Patel',   groupId: 'dual-school-b', ranks: ['MS1', 'MD1', 'XD1'], availability: [] },
  { id: 'dual-p06', name: 'Drew Nakamura', groupId: 'dual-school-b', ranks: ['MS2', 'MD1'], availability: [] },
  { id: 'dual-p07', name: 'Quinn Diaz',    groupId: 'dual-school-b', ranks: ['WS1', 'WD1'], availability: [] },
  { id: 'dual-p08', name: 'Sam Vance',     groupId: 'dual-school-b', ranks: ['WS2', 'WD1', 'XD2'], availability: [] },
  // Highland
  { id: 'dual-p09', name: 'Robin Costa',   groupId: 'dual-school-c', ranks: ['MS1', 'MD1'], availability: [] },
  { id: 'dual-p10', name: 'Ash Tanaka',    groupId: 'dual-school-c', ranks: ['MS2', 'MD1', 'XD1'], availability: [] },
  { id: 'dual-p11', name: 'Skyler Bryant', groupId: 'dual-school-c', ranks: ['WS1', 'WD1', 'XD2'], availability: [] },
  { id: 'dual-p12', name: 'Tatum Reyes',   groupId: 'dual-school-c', ranks: ['WS2', 'WD1'], availability: [] },
  // Westgate
  { id: 'dual-p13', name: 'Jordan Murphy', groupId: 'dual-school-d', ranks: ['MS1', 'MD1', 'XD1'], availability: [] },
  { id: 'dual-p14', name: 'Avery Quinn',   groupId: 'dual-school-d', ranks: ['MS2', 'MD1'], availability: [] },
  { id: 'dual-p15', name: 'Charlie Hale',  groupId: 'dual-school-d', ranks: ['WS1', 'WD1'], availability: [] },
  { id: 'dual-p16', name: 'Sage Olsen',    groupId: 'dual-school-d', ranks: ['WS2', 'WD1', 'XD2'], availability: [] },
];

// 24 matches — 6 round-robin pairings (C(4,2)) × 4 representative
// events per pairing. Each match is dual (two sides). IDs encode the
// pairing for easy mental lookup. The schedule below assigns each one
// to a slot + court.
const MATCHES: MatchDTO[] = [
  // A vs B
  { id: 'dual-m01', matchNumber: 1,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['dual-p01'], sideB: ['dual-p05'] },
  { id: 'dual-m02', matchNumber: 2,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['dual-p03'], sideB: ['dual-p07'] },
  { id: 'dual-m03', matchNumber: 3,  matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['dual-p01', 'dual-p02'], sideB: ['dual-p05', 'dual-p06'] },
  { id: 'dual-m04', matchNumber: 4,  matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['dual-p03', 'dual-p01'], sideB: ['dual-p07', 'dual-p05'] },
  // A vs C
  { id: 'dual-m05', matchNumber: 5,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['dual-p01'], sideB: ['dual-p09'] },
  { id: 'dual-m06', matchNumber: 6,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['dual-p03'], sideB: ['dual-p11'] },
  { id: 'dual-m07', matchNumber: 7,  matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['dual-p01', 'dual-p02'], sideB: ['dual-p09', 'dual-p10'] },
  { id: 'dual-m08', matchNumber: 8,  matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['dual-p03', 'dual-p01'], sideB: ['dual-p11', 'dual-p10'] },
  // A vs D
  { id: 'dual-m09', matchNumber: 9,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['dual-p01'], sideB: ['dual-p13'] },
  { id: 'dual-m10', matchNumber: 10, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['dual-p03'], sideB: ['dual-p15'] },
  { id: 'dual-m11', matchNumber: 11, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['dual-p01', 'dual-p02'], sideB: ['dual-p13', 'dual-p14'] },
  { id: 'dual-m12', matchNumber: 12, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['dual-p03', 'dual-p01'], sideB: ['dual-p15', 'dual-p13'] },
  // B vs C
  { id: 'dual-m13', matchNumber: 13, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['dual-p05'], sideB: ['dual-p09'] },
  { id: 'dual-m14', matchNumber: 14, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['dual-p07'], sideB: ['dual-p11'] },
  { id: 'dual-m15', matchNumber: 15, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['dual-p05', 'dual-p06'], sideB: ['dual-p09', 'dual-p10'] },
  { id: 'dual-m16', matchNumber: 16, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['dual-p07', 'dual-p05'], sideB: ['dual-p11', 'dual-p10'] },
  // B vs D
  { id: 'dual-m17', matchNumber: 17, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['dual-p05'], sideB: ['dual-p13'] },
  { id: 'dual-m18', matchNumber: 18, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['dual-p07'], sideB: ['dual-p15'] },
  { id: 'dual-m19', matchNumber: 19, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['dual-p05', 'dual-p06'], sideB: ['dual-p13', 'dual-p14'] },
  { id: 'dual-m20', matchNumber: 20, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['dual-p07', 'dual-p05'], sideB: ['dual-p15', 'dual-p13'] },
  // C vs D
  { id: 'dual-m21', matchNumber: 21, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['dual-p09'], sideB: ['dual-p13'] },
  { id: 'dual-m22', matchNumber: 22, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['dual-p11'], sideB: ['dual-p15'] },
  { id: 'dual-m23', matchNumber: 23, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['dual-p09', 'dual-p10'], sideB: ['dual-p13', 'dual-p14'] },
  { id: 'dual-m24', matchNumber: 24, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['dual-p11', 'dual-p09'], sideB: ['dual-p15', 'dual-p13'] },
];

// 24 matches across 6 courts × 4 slots = 24 cells. One per cell, no
// player conflicts because pairings rotate cleanly.
const SCHEDULE: ScheduleDTO = {
  status: 'optimal',
  assignments: MATCHES.map((m, i) => ({
    matchId: m.id,
    slotId: Math.floor(i / 6),
    courtId: (i % 6) + 1,
    durationSlots: 1,
  })),
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
    dayEnd: '12:00',
    breaks: [],
    courtCount: 6,
    defaultRestMinutes: 30,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 1, WS: 1, MD: 1, WD: 0, XD: 1 },
  },
  groups: SCHOOLS,
  players: PLAYERS,
  matches: MATCHES,
  schedule: SCHEDULE,
};
