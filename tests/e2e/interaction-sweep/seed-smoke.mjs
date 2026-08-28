/**
 * Seed the workspaces the interaction-smoke suite presses against, over the
 * real HTTP API.
 *
 * Two workspaces, because the suite tests two things:
 *   - `tid`       — an OWNER's workspace with enough shape that pressing things
 *                   is meaningful: a roster, matches, a schedule, and a couple
 *                   of live match states, so the Run view actually renders its
 *                   action buttons.
 *   - `viewerTid` — the same shape, but the caller is demoted to `viewer`
 *                   afterwards (see make-viewer.py — there is no HTTP path to a
 *                   viewer role: the creator is always written as `owner`).
 *                   This is what proves a read-only caller cannot mutate.
 *
 * Both are seeded here while the caller is still an owner; the demotion is the
 * LAST step, so seeding never has to fight the permission it is setting up.
 *
 * Output is `key=value` lines — directly appendable to $GITHUB_OUTPUT:
 *   tid=<uuid>
 *   viewerTid=<uuid>
 *   displayToken=<capability-token>
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
const put = async (path, body, headers = {}) => {
  // SP-CLOUD-4: PUT /tournaments/{id}/state requires an If-Match precondition
  // and refuses a write without one (412). Read the current version first,
  // exactly as the app's own client does — this script is a real client of
  // that API and gets no exemption from its contract.
  const extra = { ...headers };
  const stateRoute = /^\/tournaments\/[^/]+\/state(?:\?|$)/.test(path);
  if (stateRoute && !Object.keys(extra).some((k) => k.toLowerCase() === 'if-match')) {
    const probe = await fetch(`${API}${path.split('?')[0]}`, { headers });
    const etag = probe.headers.get('etag');
    if (etag) extra['If-Match'] = etag;
  }
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

/**
 * Match mutations are version-guarded: every write needs an `If-Match` carrying
 * the match's current version, and the read hands it back as an `ETag`.
 *
 * Don't try to MODEL the version here. A never-written match has an implicit
 * version 0, but the state blob PUT above creates the match rows — so by the
 * time we get here they are already at 1. Read it, don't guess it; the guessing
 * version of this cost a 412 and an hour.
 */
const putMatchState = async (tid, matchId, body) => {
  const head = await fetch(`${API}/tournaments/${tid}/match-states/${matchId}`);
  const etag = head.ok ? (head.headers.get('etag') ?? '0') : '0';
  await put(
    `/tournaments/${tid}/match-states/${matchId}`,
    { matchId, ...body },
    { 'If-Match': etag },
  );
};

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

async function seedWorkspace(name) {
  const ws = await post('/tournaments', {
    name,
    kind: 'meet',
    modules: [
      { moduleId: 'meet', status: 'enabled' },
      { moduleId: 'display', status: 'enabled' },
      { moduleId: 'bracket', status: 'available' },
    ],
  });
  const tid = ws.id;

  // Shapes are pinned by app/schemas.py (TournamentConfig / ScheduleAssignment /
  // ScheduleDTO). `defaultRestMinutes`, `freezeHorizonSlots` and the schedule's
  // `status` are REQUIRED, and an assignment is {matchId, slotId, courtId,
  // durationSlots} — not the timeSlot/startSlot shape the frontend store uses.
  // Getting these wrong is a 422, which is how this script was found broken.
  await put(`/tournaments/${tid}/state`, {
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '17:00',
      courtCount: 2,
      meetMode: 'dual',
      defaultRestMinutes: 30,
      freezeHorizonSlots: 0,
      rankCounts: { MS: 2, WS: 2 },
    },
    groups: [
      { id: 'g1', name: 'School A' },
      { id: 'g2', name: 'School B' },
    ],
    players,
    matches,
    schedule: {
      status: 'optimal',
      assignments: matches.map((m, i) => ({
        matchId: m.id,
        slotId: Math.floor(i / 2),
        courtId: (i % 2) + 1,
        durationSlots: 1,
      })),
    },
    planFinalized: true,
  });

  // A live day in progress: one called, one started — so the Run view renders
  // its Undo/Score affordances (the exact controls audit A1 found broken, and
  // the Call/Start controls the viewer test asserts are disabled).
  await putMatchState(tid, 'm1', { status: 'called' });
  await putMatchState(tid, 'm2', { status: 'called' });
  await putMatchState(tid, 'm2', { status: 'started' });

  return tid;
}

const tid = await seedWorkspace('Interaction smoke');
const viewerTid = await seedWorkspace('Interaction smoke (viewer)');
const displayResponse = await fetch(`${API}/tournaments/${tid}/display-token`);
if (!displayResponse.ok) {
  throw new Error(`GET /tournaments/${tid}/display-token → ${displayResponse.status}`);
}
const { token: displayToken } = await displayResponse.json();
if (typeof displayToken !== 'string' || !displayToken) {
  throw new Error('display token response did not contain a token');
}

console.log(`tid=${tid}`);
console.log(`viewerTid=${viewerTid}`);
console.log(`displayToken=${displayToken}`);
