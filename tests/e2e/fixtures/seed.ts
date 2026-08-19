/**
 * Canned tournament used by the specs that need schedulable data without
 * going through the (Step 5) inline roster / match flow. Inject into
 * ``localStorage['scheduler-storage']`` via ``addInitScript`` before navigating.
 */
export const SEED_TOURNAMENT = {
  state: {
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '13:00',
      breaks: [],
      courtCount: 3,
      defaultRestMinutes: 30,
      freezeHorizonSlots: 0,
      rankCounts: { MS: 2, WS: 2, MD: 1, WD: 1, XD: 1 },
    },
    groups: [
      { id: 'g1', name: 'School A' },
      { id: 'g2', name: 'School B' },
    ],
    players: [
      { id: 'p1', name: 'Alice', groupId: 'g1', ranks: ['MS1'], availability: [] },
      { id: 'p2', name: 'Bob',   groupId: 'g2', ranks: ['MS1'], availability: [] },
      { id: 'p3', name: 'Carol', groupId: 'g1', ranks: ['MS2'], availability: [] },
      { id: 'p4', name: 'Dave',  groupId: 'g2', ranks: ['MS2'], availability: [] },
    ],
    matches: [
      { id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1', durationSlots: 1, matchType: 'dual' },
      { id: 'm2', matchNumber: 2, sideA: ['p3'], sideB: ['p4'], eventRank: 'MS2', durationSlots: 1, matchType: 'dual' },
      { id: 'm3', matchNumber: 3, sideA: ['p1'], sideB: ['p4'], eventRank: 'MS3', durationSlots: 1, matchType: 'dual' },
      { id: 'm4', matchNumber: 4, sideA: ['p2'], sideB: ['p3'], eventRank: 'MS4', durationSlots: 1, matchType: 'dual' },
    ],
  },
  version: 0,
} as const;
