/**
 * Seed a workspace for the interaction-smoke suite, over the real HTTP API.
 *
 * CI needs a workspace with enough shape that pressing things is meaningful —
 * a roster, matches, a schedule, and a couple of live match states, so the Run
 * view actually renders its action buttons. Printing the tournament id on stdout
 * lets the job feed it to the suite as SMOKE_TID.
 *
 * Usage: node seed-smoke.mjs [apiBase]   # default http://localhost:8600
 */
const API = process.argv[2] ?? process.env.SMOKE_API ?? 'http://localhost:8600';

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
};
const put = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

const ws = await post('/tournaments', {
  name: 'Interaction smoke',
  kind: 'meet',
  modules: [
    { moduleId: 'meet', status: 'enabled' },
    { moduleId: 'display', status: 'enabled' },
    { moduleId: 'bracket', status: 'available' },
  ],
});
const tid = ws.id;

const players = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
  groupId: i < 4 ? 'g1' : 'g2',
  ranks: [],
}));
const matches = [
  { id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p5'], eventRank: 'MS1', durationSlots: 1, matchType: 'dual' },
  { id: 'm2', matchNumber: 2, sideA: ['p2'], sideB: ['p6'], eventRank: 'MS2', durationSlots: 1, matchType: 'dual' },
  { id: 'm3', matchNumber: 3, sideA: ['p3'], sideB: ['p7'], eventRank: 'WS1', durationSlots: 1, matchType: 'dual' },
  { id: 'm4', matchNumber: 4, sideA: ['p4'], sideB: ['p8'], eventRank: 'WS2', durationSlots: 1, matchType: 'dual' },
];

await put(`/tournaments/${tid}/state`, {
  config: {
    intervalMinutes: 30,
    dayStart: '09:00',
    dayEnd: '17:00',
    courtCount: 2,
    meetMode: 'dual',
    rankCounts: { MS: 2, WS: 2 },
    scoringFormat: 'badminton',
    setsToWin: 2,
    pointsPerSet: 21,
  },
  groups: [
    { id: 'g1', name: 'School A' },
    { id: 'g2', name: 'School B' },
  ],
  players,
  matches,
  schedule: {
    assignments: matches.map((m, i) => ({
      matchId: m.id,
      courtId: (i % 2) + 1,
      timeSlot: Math.floor(i / 2),
      startSlot: Math.floor(i / 2),
    })),
  },
  planFinalized: true,
});

// A live day in progress: one playing, one finished — so the Run view renders
// its Undo/Score affordances (the exact controls audit A1 found broken).
await put(`/tournaments/${tid}/match-states/m1`, { matchId: 'm1', status: 'called' });
await put(`/tournaments/${tid}/match-states/m2`, { matchId: 'm2', status: 'called' });
await put(`/tournaments/${tid}/match-states/m2`, { matchId: 'm2', status: 'started' });

console.log(tid);
