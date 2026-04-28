/**
 * Tri-meet sample tournament — 3 schools, full round-robin.
 *
 * In badminton a tri-meet is a tournament with 3 participating schools.
 * Every match is still A vs B (one side per side); the "tri" part is
 * that all three pairings (A-B, A-C, B-C) play each event, and each
 * pairing plays every event TWICE so combined results decide the
 * meet winner. With 3 events × 3 pairings × 2 plays = 18 matches.
 *
 * Players carry a primary rank per event and a "secondary" rank for
 * the second play (different player when possible) so each pairing's
 * second play actually involves different bodies.
 */
import type {
  RosterGroupDTO,
  PlayerDTO,
  MatchDTO,
  ScheduleDTO,
} from '../../../api/dto';
import type { DemoFixture } from './dual';

const SCHOOLS: RosterGroupDTO[] = [
  { id: 'tri-school-a', name: 'Crescent Pointe', metadata: { color: '#e11d48' } },
  { id: 'tri-school-b', name: 'Stonebridge',     metadata: { color: '#0d9488' } },
  { id: 'tri-school-c', name: 'Maple Ridge',     metadata: { color: '#7c3aed' } },
];

// 6 players per school. Two each for MS / WS / MD so each pairing's
// second play uses a different person from the first.
const PLAYERS: PlayerDTO[] = [
  // Crescent Pointe
  { id: 'tri-p01', name: 'Iris Walker',  groupId: 'tri-school-a', ranks: ['MS1'], availability: [] },
  { id: 'tri-p02', name: 'Felix Adler',  groupId: 'tri-school-a', ranks: ['MS2'], availability: [] },
  { id: 'tri-p03', name: 'Nora Bain',    groupId: 'tri-school-a', ranks: ['WS1'], availability: [] },
  { id: 'tri-p04', name: 'Owen Trent',   groupId: 'tri-school-a', ranks: ['WS2'], availability: [] },
  { id: 'tri-p05', name: 'Lila Cho',     groupId: 'tri-school-a', ranks: ['MD1'], availability: [] },
  { id: 'tri-p06', name: 'Wesley Ortiz', groupId: 'tri-school-a', ranks: ['MD1'], availability: [] },
  // Stonebridge
  { id: 'tri-p07', name: 'Hugo Stein',    groupId: 'tri-school-b', ranks: ['MS1'], availability: [] },
  { id: 'tri-p08', name: 'Iris Yamada',   groupId: 'tri-school-b', ranks: ['MS2'], availability: [] },
  { id: 'tri-p09', name: 'June Park',     groupId: 'tri-school-b', ranks: ['WS1'], availability: [] },
  { id: 'tri-p10', name: 'Asa Kuznetsov', groupId: 'tri-school-b', ranks: ['WS2'], availability: [] },
  { id: 'tri-p11', name: 'Mira Goh',      groupId: 'tri-school-b', ranks: ['MD1'], availability: [] },
  { id: 'tri-p12', name: 'Liam Croft',    groupId: 'tri-school-b', ranks: ['MD1'], availability: [] },
  // Maple Ridge
  { id: 'tri-p13', name: 'Cleo Ng',     groupId: 'tri-school-c', ranks: ['MS1'], availability: [] },
  { id: 'tri-p14', name: 'Eli Vance',   groupId: 'tri-school-c', ranks: ['MS2'], availability: [] },
  { id: 'tri-p15', name: 'Vera Lopez',  groupId: 'tri-school-c', ranks: ['WS1'], availability: [] },
  { id: 'tri-p16', name: 'Bryn Kuffel', groupId: 'tri-school-c', ranks: ['WS2'], availability: [] },
  { id: 'tri-p17', name: 'Theo Shaw',   groupId: 'tri-school-c', ranks: ['MD1'], availability: [] },
  { id: 'tri-p18', name: 'Reyna Bach',  groupId: 'tri-school-c', ranks: ['MD1'], availability: [] },
];

// Every match is dual-style A-vs-B. The 18 matches break down as:
//   3 pairings × 3 events × 2 plays = 18.
// First play uses each side's primary player(s); second play uses
// the secondary slot. ``matchType`` stays 'dual' on every match —
// the "tri" identity is on the tournament, not the match.
const MATCHES: MatchDTO[] = [
  // ── A vs B ──────────────────────────────────────────────────
  { id: 'tri-m01', matchNumber: 1,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p01'], sideB: ['tri-p07'] },
  { id: 'tri-m02', matchNumber: 2,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p02'], sideB: ['tri-p08'] },
  { id: 'tri-m03', matchNumber: 3,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p03'], sideB: ['tri-p09'] },
  { id: 'tri-m04', matchNumber: 4,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p04'], sideB: ['tri-p10'] },
  { id: 'tri-m05', matchNumber: 5,  matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p05', 'tri-p06'], sideB: ['tri-p11', 'tri-p12'] },
  { id: 'tri-m06', matchNumber: 6,  matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p06', 'tri-p05'], sideB: ['tri-p12', 'tri-p11'] },
  // ── A vs C ──────────────────────────────────────────────────
  { id: 'tri-m07', matchNumber: 7,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p01'], sideB: ['tri-p13'] },
  { id: 'tri-m08', matchNumber: 8,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p02'], sideB: ['tri-p14'] },
  { id: 'tri-m09', matchNumber: 9,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p03'], sideB: ['tri-p15'] },
  { id: 'tri-m10', matchNumber: 10, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p04'], sideB: ['tri-p16'] },
  { id: 'tri-m11', matchNumber: 11, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p05', 'tri-p06'], sideB: ['tri-p17', 'tri-p18'] },
  { id: 'tri-m12', matchNumber: 12, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p06', 'tri-p05'], sideB: ['tri-p18', 'tri-p17'] },
  // ── B vs C ──────────────────────────────────────────────────
  { id: 'tri-m13', matchNumber: 13, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p07'], sideB: ['tri-p13'] },
  { id: 'tri-m14', matchNumber: 14, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p08'], sideB: ['tri-p14'] },
  { id: 'tri-m15', matchNumber: 15, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p09'], sideB: ['tri-p15'] },
  { id: 'tri-m16', matchNumber: 16, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p10'], sideB: ['tri-p16'] },
  { id: 'tri-m17', matchNumber: 17, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p11', 'tri-p12'], sideB: ['tri-p17', 'tri-p18'] },
  { id: 'tri-m18', matchNumber: 18, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p12', 'tri-p11'], sideB: ['tri-p18', 'tri-p17'] },
];

// 18 matches across 6 courts × 3 slots = 18 cells.
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

export const TRI_DEMO: DemoFixture = {
  config: {
    tournamentName: 'Tri-County Invitational',
    meetMode: 'tri',
    intervalMinutes: 30,
    dayStart: '10:00',
    dayEnd: '12:00',
    breaks: [],
    courtCount: 6,
    defaultRestMinutes: 30,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 1, WS: 1, MD: 1, WD: 0, XD: 0 },
  },
  groups: SCHOOLS,
  players: PLAYERS,
  matches: MATCHES,
  schedule: SCHEDULE,
};
