/**
 * Tri-meet sample tournament — 3 schools × 10 players × 30 matches.
 *
 * In badminton a tri-meet is a tournament with 3 participating schools.
 * Every match is dual-format (one side per school, two sides total);
 * the "tri" identity lives on the *tournament*, not the match. All
 * three pairings (A-B, A-C, B-C) play each event twice so combined
 * results decide the meet winner.
 *
 *   3 pairings × 5 events × 2 plays = 30 matches.
 *
 * Roster shape (per school):
 *   • 5 men  · MS1 / MD1 pair / XD1 / reserve
 *   • 5 women · WS1 / WD1 pair / XD1 / reserve
 *
 * Schedule shape:
 *   6 slots × 6 courts. Each pairing claims a 2-slot band (5 events
 *   per band, court 6 idle) so a player never plays two matches in
 *   one slot. Sequential pairings — no two pairings share a slot
 *   because every pair of pairings overlaps on at least one school.
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

// 10 players per school. Men ``p01-p05`` / women ``p06-p10`` for A,
// ``p11-p15`` / ``p16-p20`` for B, ``p21-p25`` / ``p26-p30`` for C.
// One player per ladder slot (single-position events) plus a bench
// reserve to exercise the unranked-roster UI.
const PLAYERS: PlayerDTO[] = [
  // Crescent Pointe · men
  { id: 'tri-p01', name: 'Felix Adler',     groupId: 'tri-school-a', ranks: ['MS1'],         availability: [] },
  { id: 'tri-p02', name: 'Owen Trent',      groupId: 'tri-school-a', ranks: ['MD1'],         availability: [] },
  { id: 'tri-p03', name: 'Wesley Ortiz',    groupId: 'tri-school-a', ranks: ['MD1'],         availability: [] },
  { id: 'tri-p04', name: 'Hugo Stein',      groupId: 'tri-school-a', ranks: ['XD1'],         availability: [] },
  { id: 'tri-p05', name: 'Liam Croft',      groupId: 'tri-school-a', ranks: [],              availability: [] },
  // Crescent Pointe · women
  { id: 'tri-p06', name: 'Iris Walker',     groupId: 'tri-school-a', ranks: ['WS1'],         availability: [] },
  { id: 'tri-p07', name: 'Nora Bain',       groupId: 'tri-school-a', ranks: ['WD1'],         availability: [] },
  { id: 'tri-p08', name: 'Lila Cho',        groupId: 'tri-school-a', ranks: ['WD1'],         availability: [] },
  { id: 'tri-p09', name: 'June Park',       groupId: 'tri-school-a', ranks: ['XD1'],         availability: [] },
  { id: 'tri-p10', name: 'Vera Lopez',      groupId: 'tri-school-a', ranks: [],              availability: [] },
  // Stonebridge · men
  { id: 'tri-p11', name: 'Theo Shaw',       groupId: 'tri-school-b', ranks: ['MS1'],         availability: [] },
  { id: 'tri-p12', name: 'Eli Vance',       groupId: 'tri-school-b', ranks: ['MD1'],         availability: [] },
  { id: 'tri-p13', name: 'Asa Bach',        groupId: 'tri-school-b', ranks: ['MD1'],         availability: [] },
  { id: 'tri-p14', name: 'Mateo Goh',       groupId: 'tri-school-b', ranks: ['XD1'],         availability: [] },
  { id: 'tri-p15', name: 'Bryce Kim',       groupId: 'tri-school-b', ranks: [],              availability: [] },
  // Stonebridge · women
  { id: 'tri-p16', name: 'Cleo Ng',         groupId: 'tri-school-b', ranks: ['WS1'],         availability: [] },
  { id: 'tri-p17', name: 'Mira Lee',        groupId: 'tri-school-b', ranks: ['WD1'],         availability: [] },
  { id: 'tri-p18', name: 'Sara Chu',        groupId: 'tri-school-b', ranks: ['WD1'],         availability: [] },
  { id: 'tri-p19', name: 'Ava Tan',         groupId: 'tri-school-b', ranks: ['XD1'],         availability: [] },
  { id: 'tri-p20', name: 'Eva Wong',        groupId: 'tri-school-b', ranks: [],              availability: [] },
  // Maple Ridge · men
  { id: 'tri-p21', name: 'Caleb Park',      groupId: 'tri-school-c', ranks: ['MS1'],         availability: [] },
  { id: 'tri-p22', name: 'Marcus Reyes',    groupId: 'tri-school-c', ranks: ['MD1'],         availability: [] },
  { id: 'tri-p23', name: 'Niles Yamada',    groupId: 'tri-school-c', ranks: ['MD1'],         availability: [] },
  { id: 'tri-p24', name: 'Soren Croft',     groupId: 'tri-school-c', ranks: ['XD1'],         availability: [] },
  { id: 'tri-p25', name: 'Yuki Bach',       groupId: 'tri-school-c', ranks: [],              availability: [] },
  // Maple Ridge · women
  { id: 'tri-p26', name: 'Brynn Stein',     groupId: 'tri-school-c', ranks: ['WS1'],         availability: [] },
  { id: 'tri-p27', name: 'Esme Walker',     groupId: 'tri-school-c', ranks: ['WD1'],         availability: [] },
  { id: 'tri-p28', name: 'Skye Adler',      groupId: 'tri-school-c', ranks: ['WD1'],         availability: [] },
  { id: 'tri-p29', name: 'Ruby Goh',        groupId: 'tri-school-c', ranks: ['XD1'],         availability: [] },
  { id: 'tri-p30', name: 'Solene Vance',    groupId: 'tri-school-c', ranks: [],              availability: [] },
];

// 30 matches — 3 pairings × 5 events × 2 plays. Plays repeat the same
// player slots; the duplicated match represents the second leg of a
// best-of-2 series. ``matchType`` stays ``'dual'`` on every match —
// the tri-meet identity is on the tournament, not the match.
const MATCHES: MatchDTO[] = [
  // ── A vs B ──────────────────────────────────────────────────
  { id: 'tri-m01', matchNumber: 1,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p01'],            sideB: ['tri-p11'] },
  { id: 'tri-m02', matchNumber: 2,  matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p01'],            sideB: ['tri-p11'] },
  { id: 'tri-m03', matchNumber: 3,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p06'],            sideB: ['tri-p16'] },
  { id: 'tri-m04', matchNumber: 4,  matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p06'],            sideB: ['tri-p16'] },
  { id: 'tri-m05', matchNumber: 5,  matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p02', 'tri-p03'], sideB: ['tri-p12', 'tri-p13'] },
  { id: 'tri-m06', matchNumber: 6,  matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p02', 'tri-p03'], sideB: ['tri-p12', 'tri-p13'] },
  { id: 'tri-m07', matchNumber: 7,  matchType: 'dual', eventRank: 'WD1', durationSlots: 1, sideA: ['tri-p07', 'tri-p08'], sideB: ['tri-p17', 'tri-p18'] },
  { id: 'tri-m08', matchNumber: 8,  matchType: 'dual', eventRank: 'WD1', durationSlots: 1, sideA: ['tri-p07', 'tri-p08'], sideB: ['tri-p17', 'tri-p18'] },
  { id: 'tri-m09', matchNumber: 9,  matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['tri-p04', 'tri-p09'], sideB: ['tri-p14', 'tri-p19'] },
  { id: 'tri-m10', matchNumber: 10, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['tri-p04', 'tri-p09'], sideB: ['tri-p14', 'tri-p19'] },
  // ── A vs C ──────────────────────────────────────────────────
  { id: 'tri-m11', matchNumber: 11, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p01'],            sideB: ['tri-p21'] },
  { id: 'tri-m12', matchNumber: 12, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p01'],            sideB: ['tri-p21'] },
  { id: 'tri-m13', matchNumber: 13, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p06'],            sideB: ['tri-p26'] },
  { id: 'tri-m14', matchNumber: 14, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p06'],            sideB: ['tri-p26'] },
  { id: 'tri-m15', matchNumber: 15, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p02', 'tri-p03'], sideB: ['tri-p22', 'tri-p23'] },
  { id: 'tri-m16', matchNumber: 16, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p02', 'tri-p03'], sideB: ['tri-p22', 'tri-p23'] },
  { id: 'tri-m17', matchNumber: 17, matchType: 'dual', eventRank: 'WD1', durationSlots: 1, sideA: ['tri-p07', 'tri-p08'], sideB: ['tri-p27', 'tri-p28'] },
  { id: 'tri-m18', matchNumber: 18, matchType: 'dual', eventRank: 'WD1', durationSlots: 1, sideA: ['tri-p07', 'tri-p08'], sideB: ['tri-p27', 'tri-p28'] },
  { id: 'tri-m19', matchNumber: 19, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['tri-p04', 'tri-p09'], sideB: ['tri-p24', 'tri-p29'] },
  { id: 'tri-m20', matchNumber: 20, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['tri-p04', 'tri-p09'], sideB: ['tri-p24', 'tri-p29'] },
  // ── B vs C ──────────────────────────────────────────────────
  { id: 'tri-m21', matchNumber: 21, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p11'],            sideB: ['tri-p21'] },
  { id: 'tri-m22', matchNumber: 22, matchType: 'dual', eventRank: 'MS1', durationSlots: 1, sideA: ['tri-p11'],            sideB: ['tri-p21'] },
  { id: 'tri-m23', matchNumber: 23, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p16'],            sideB: ['tri-p26'] },
  { id: 'tri-m24', matchNumber: 24, matchType: 'dual', eventRank: 'WS1', durationSlots: 1, sideA: ['tri-p16'],            sideB: ['tri-p26'] },
  { id: 'tri-m25', matchNumber: 25, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p12', 'tri-p13'], sideB: ['tri-p22', 'tri-p23'] },
  { id: 'tri-m26', matchNumber: 26, matchType: 'dual', eventRank: 'MD1', durationSlots: 1, sideA: ['tri-p12', 'tri-p13'], sideB: ['tri-p22', 'tri-p23'] },
  { id: 'tri-m27', matchNumber: 27, matchType: 'dual', eventRank: 'WD1', durationSlots: 1, sideA: ['tri-p17', 'tri-p18'], sideB: ['tri-p27', 'tri-p28'] },
  { id: 'tri-m28', matchNumber: 28, matchType: 'dual', eventRank: 'WD1', durationSlots: 1, sideA: ['tri-p17', 'tri-p18'], sideB: ['tri-p27', 'tri-p28'] },
  { id: 'tri-m29', matchNumber: 29, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['tri-p14', 'tri-p19'], sideB: ['tri-p24', 'tri-p29'] },
  { id: 'tri-m30', matchNumber: 30, matchType: 'dual', eventRank: 'XD1', durationSlots: 1, sideA: ['tri-p14', 'tri-p19'], sideB: ['tri-p24', 'tri-p29'] },
];

// Schedule layout — each pairing claims a 2-slot band (one play each
// slot). Court 6 stays open per slot so the demo also exercises the
// "available court" UI band.
//   slots 0-1: A vs B   (m01-m10 split into the two plays)
//   slots 2-3: A vs C   (m11-m20)
//   slots 4-5: B vs C   (m21-m30)
const SCHEDULE: ScheduleDTO = {
  status: 'optimal',
  assignments: [
    // A vs B · play 1
    { matchId: 'tri-m01', slotId: 0, courtId: 1, durationSlots: 1 },
    { matchId: 'tri-m03', slotId: 0, courtId: 2, durationSlots: 1 },
    { matchId: 'tri-m05', slotId: 0, courtId: 3, durationSlots: 1 },
    { matchId: 'tri-m07', slotId: 0, courtId: 4, durationSlots: 1 },
    { matchId: 'tri-m09', slotId: 0, courtId: 5, durationSlots: 1 },
    // A vs B · play 2
    { matchId: 'tri-m02', slotId: 1, courtId: 1, durationSlots: 1 },
    { matchId: 'tri-m04', slotId: 1, courtId: 2, durationSlots: 1 },
    { matchId: 'tri-m06', slotId: 1, courtId: 3, durationSlots: 1 },
    { matchId: 'tri-m08', slotId: 1, courtId: 4, durationSlots: 1 },
    { matchId: 'tri-m10', slotId: 1, courtId: 5, durationSlots: 1 },
    // A vs C · play 1
    { matchId: 'tri-m11', slotId: 2, courtId: 1, durationSlots: 1 },
    { matchId: 'tri-m13', slotId: 2, courtId: 2, durationSlots: 1 },
    { matchId: 'tri-m15', slotId: 2, courtId: 3, durationSlots: 1 },
    { matchId: 'tri-m17', slotId: 2, courtId: 4, durationSlots: 1 },
    { matchId: 'tri-m19', slotId: 2, courtId: 5, durationSlots: 1 },
    // A vs C · play 2
    { matchId: 'tri-m12', slotId: 3, courtId: 1, durationSlots: 1 },
    { matchId: 'tri-m14', slotId: 3, courtId: 2, durationSlots: 1 },
    { matchId: 'tri-m16', slotId: 3, courtId: 3, durationSlots: 1 },
    { matchId: 'tri-m18', slotId: 3, courtId: 4, durationSlots: 1 },
    { matchId: 'tri-m20', slotId: 3, courtId: 5, durationSlots: 1 },
    // B vs C · play 1
    { matchId: 'tri-m21', slotId: 4, courtId: 1, durationSlots: 1 },
    { matchId: 'tri-m23', slotId: 4, courtId: 2, durationSlots: 1 },
    { matchId: 'tri-m25', slotId: 4, courtId: 3, durationSlots: 1 },
    { matchId: 'tri-m27', slotId: 4, courtId: 4, durationSlots: 1 },
    { matchId: 'tri-m29', slotId: 4, courtId: 5, durationSlots: 1 },
    // B vs C · play 2
    { matchId: 'tri-m22', slotId: 5, courtId: 1, durationSlots: 1 },
    { matchId: 'tri-m24', slotId: 5, courtId: 2, durationSlots: 1 },
    { matchId: 'tri-m26', slotId: 5, courtId: 3, durationSlots: 1 },
    { matchId: 'tri-m28', slotId: 5, courtId: 4, durationSlots: 1 },
    { matchId: 'tri-m30', slotId: 5, courtId: 5, durationSlots: 1 },
  ],
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
    dayStart: '09:00',
    dayEnd: '12:00',
    breaks: [],
    courtCount: 6,
    // Tri round-robin requires the same player to appear in multiple
    // pairings (A-B, A-C, B-C). The pre-baked schedule packs those
    // appearances tightly, so required rest is 0 — operator dials it
    // up once they're past the demo. See dual.ts for the same note.
    defaultRestMinutes: 0,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 1, WS: 1, MD: 1, WD: 1, XD: 1 },
  },
  groups: SCHOOLS,
  players: PLAYERS,
  matches: MATCHES,
  schedule: SCHEDULE,
};
