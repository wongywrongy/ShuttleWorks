import { describe, it, expect } from 'vitest';
import { meetToOpsBlocks, bracketToOpsBlocks, parseOpsKey, packBlockLanes } from '../opsBlock';
import { buildLiveChips } from '../runtime/boardPlacements';
import type { OpsBlock } from '../opsBlock';
import type { MatchDTO, ScheduleDTO, MatchStateDTO, TournamentConfig } from '../../../api/dto';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

// Minimal config: 08:00 day start, 30-min slots — slot N == 08:00 + N*30m.
const cfg = {
  dayStart: '08:00',
  dayEnd: '20:00',
  intervalMinutes: 30,
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
} as TournamentConfig;

function ob(p: Partial<OpsBlock> & Pick<OpsBlock, 'source' | 'id'>): OpsBlock {
  return { key: `${p.source}:${p.id}`, label: p.id, span: 1, status: 'scheduled', sideA: 'A', sideB: 'B', done: false, started: false, ...p };
}

describe('opsBlock builders', () => {
  it('meet block uses the live actualSlotId override over the planned slot', () => {
    const matches = [{ id: 'm', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1' } as any];
    const schedule = { assignments: [{ matchId: 'm', slotId: 2, courtId: 1, durationSlots: 1 }] } as any;
    const states = { m: { matchId: 'm', status: 'scheduled', actualCourtId: 3, actualSlotId: 9 } } as any;
    const [b] = meetToOpsBlocks(matches, schedule, states, { p1: 'P1', p2: 'P2' }, cfg);
    expect(b.court).toBe(3);
    expect(b.slot).toBe(9);
  });

  it('meetToOpsBlocks carries court/slot/span/status and a source-prefixed key', () => {
    const matches = [{ id: 'm1', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1', durationSlots: 1 }] as unknown as MatchDTO[];
    const schedule = { assignments: [{ matchId: 'm1', courtId: 2, slotId: 4, durationSlots: 1 }] } as unknown as ScheduleDTO;
    const states: Record<string, MatchStateDTO> = { m1: { status: 'started' } as MatchStateDTO };
    const [b] = meetToOpsBlocks(matches, schedule, states, { p1: 'Alice', p2: 'Bob' }, cfg);
    expect(b).toMatchObject({ source: 'meet', id: 'm1', key: 'meet:m1', court: 2, slot: 4, span: 1, status: 'started', started: true, done: false, sideA: 'Alice', sideB: 'Bob' });
  });

  it('a started meet block surfaces actualStartSlot (no end) from match-state timing', () => {
    // Build the timestamp in LOCAL time so msToSlot (which reads local time)
    // resolves it back to the same slot regardless of the test machine's TZ.
    const startedAt = new Date(2026, 0, 1, 9, 0).toISOString(); // local 09:00 -> slot (60/30)=2
    const matches = [{ id: 'm', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1' }] as any;
    const schedule = { assignments: [{ matchId: 'm', slotId: 0, courtId: 1, durationSlots: 1 }] } as any;
    const states = { m: { matchId: 'm', status: 'started', actualStartTime: startedAt } } as any;
    const [b] = meetToOpsBlocks(matches, schedule, states, { p1: 'P1', p2: 'P2' }, cfg);
    expect(b.actualStartSlot).toBe(2);
    expect(b.actualEndSlot).toBeUndefined();
  });

  it('a finished meet block surfaces both actualStartSlot and actualEndSlot', () => {
    const startedAt = new Date(2026, 0, 1, 9, 0).toISOString(); // local 09:00 -> slot 2
    const endedAt = new Date(2026, 0, 1, 10, 0).toISOString(); // local 10:00 -> slot 4
    const matches = [{ id: 'm', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1' }] as any;
    const schedule = { assignments: [{ matchId: 'm', slotId: 0, courtId: 1, durationSlots: 1 }] } as any;
    const states = {
      m: { matchId: 'm', status: 'finished', actualStartTime: startedAt, actualEndTime: endedAt },
    } as any;
    const [b] = meetToOpsBlocks(matches, schedule, states, { p1: 'P1', p2: 'P2' }, cfg);
    expect(b.actualStartSlot).toBe(2);
    expect(b.actualEndSlot).toBe(4);
  });

  it('falls back (undefined actual slots) when config is null — never throws', () => {
    const startedAt = new Date(2026, 0, 1, 9, 0).toISOString();
    const matches = [{ id: 'm', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1' }] as any;
    const schedule = { assignments: [{ matchId: 'm', slotId: 0, courtId: 1, durationSlots: 1 }] } as any;
    const states = { m: { matchId: 'm', status: 'started', actualStartTime: startedAt } } as any;
    const [b] = meetToOpsBlocks(matches, schedule, states, { p1: 'P1', p2: 'P2' }, null);
    expect(b.actualStartSlot).toBeUndefined();
    expect(b.actualEndSlot).toBeUndefined();
  });

  it('bracketToOpsBlocks marks done when a result exists', () => {
    const data = {
      participants: [{ id: 'x1', name: 'Cara' }, { id: 'x2', name: 'Dan' }],
      events: [{ id: 'MS', discipline: 'MS' }],
      play_units: [{ id: 'MS-R0-0', event_id: 'MS', side_a: ['x1'], side_b: ['x2'], slot_a: {}, slot_b: {} }],
      assignments: [{ play_unit_id: 'MS-R0-0', court_id: 1, slot_id: 0, duration_slots: 1, actual_start_slot: 0 }],
      results: [{ play_unit_id: 'MS-R0-0', winner_side: 'A' }],
    } as unknown as BracketTournamentDTO;
    const [b] = bracketToOpsBlocks(data);
    expect(b).toMatchObject({ source: 'bracket', id: 'MS-R0-0', key: 'bracket:MS-R0-0', court: 1, slot: 0, done: true, status: 'finished' });
  });

  it('a finished bracket block surfaces actualStartSlot and actualEndSlot from the assignment', () => {
    const data = {
      participants: [{ id: 'x1', name: 'Cara' }, { id: 'x2', name: 'Dan' }],
      events: [{ id: 'MS', discipline: 'MS' }],
      play_units: [{ id: 'MS-R0-0', event_id: 'MS', side_a: ['x1'], side_b: ['x2'], slot_a: {}, slot_b: {} }],
      assignments: [{ play_unit_id: 'MS-R0-0', court_id: 1, slot_id: 0, duration_slots: 1, actual_start_slot: 3, actual_end_slot: 6 }],
      results: [{ play_unit_id: 'MS-R0-0', winner_side: 'A' }],
    } as unknown as BracketTournamentDTO;
    const [b] = bracketToOpsBlocks(data);
    expect(b.actualStartSlot).toBe(3);
    expect(b.actualEndSlot).toBe(6);
  });

  it('a bracket block with no actual timing leaves actual slots undefined', () => {
    const data = {
      participants: [{ id: 'x1', name: 'Cara' }, { id: 'x2', name: 'Dan' }],
      events: [{ id: 'MS', discipline: 'MS' }],
      play_units: [{ id: 'MS-R0-0', event_id: 'MS', side_a: ['x1'], side_b: ['x2'], slot_a: {}, slot_b: {} }],
      assignments: [{ play_unit_id: 'MS-R0-0', court_id: 1, slot_id: 0, duration_slots: 1, actual_start_slot: null, actual_end_slot: null }],
      results: [],
    } as unknown as BracketTournamentDTO;
    const [b] = bracketToOpsBlocks(data);
    expect(b.actualStartSlot).toBeUndefined();
    expect(b.actualEndSlot).toBeUndefined();
  });

  it('parseOpsKey round-trips and rejects junk', () => {
    expect(parseOpsKey('meet:m1')).toEqual({ source: 'meet', id: 'm1' });
    expect(parseOpsKey('bracket:MS-R0-0')).toEqual({ source: 'bracket', id: 'MS-R0-0' });
    expect(parseOpsKey('nope')).toBeNull();
  });
});

// ── postponed flag overrides committed schedule (RED before fix) ─────────────

describe('meetToOpsBlocks — postponed flag overrides committed schedule', () => {
  const matches = [{ id: 'm', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1' }] as any;
  const schedule = { assignments: [{ matchId: 'm', slotId: 5, courtId: 2, durationSlots: 1 }] } as any;
  const names = { p1: 'P1', p2: 'P2' };

  it('postponed=true forces court+slot to undefined regardless of committed assignment', () => {
    const states = {
      m: { matchId: 'm', status: 'scheduled', actualCourtId: 2, actualSlotId: 5, postponed: true },
    } as any;
    const [b] = meetToOpsBlocks(matches, schedule, states, names, cfg);
    expect(b.court).toBeUndefined();
    expect(b.slot).toBeUndefined();
  });

  it('postponed=false still derives court from actualCourtId (non-regression)', () => {
    const states = {
      m: { matchId: 'm', status: 'scheduled', actualCourtId: 3, actualSlotId: 9, postponed: false },
    } as any;
    const [b] = meetToOpsBlocks(matches, schedule, states, names, cfg);
    expect(b.court).toBe(3);
    expect(b.slot).toBe(9);
  });

  it('postponed=true on a match with no actualCourtId (fallback also blocked)', () => {
    // Even when actualCourtId is absent and schedule provides court 2,
    // postponed=true must return undefined — not fall back to a?.courtId.
    const states = {
      m: { matchId: 'm', status: 'scheduled', postponed: true },
    } as any;
    const [b] = meetToOpsBlocks(matches, schedule, states, names, cfg);
    expect(b.court).toBeUndefined();
    expect(b.slot).toBeUndefined();
  });
});

describe('packBlockLanes', () => {
  it('puts a cross-engine double-booking (same court+slot) in separate lanes', () => {
    const meet = ob({ source: 'meet', id: 'm1', court: 1, slot: 0 });
    const brk = ob({ source: 'bracket', id: 'pu1', court: 1, slot: 0 });
    const lanes = packBlockLanes([meet, brk]);
    expect(lanes.get('meet:m1')!.laneCount).toBe(2);
    expect(lanes.get('bracket:pu1')!.laneCount).toBe(2);
    expect(lanes.get('meet:m1')!.laneIndex).not.toBe(lanes.get('bracket:pu1')!.laneIndex);
  });

  it('keeps non-overlapping blocks on the same court in a single lane', () => {
    const a = ob({ source: 'meet', id: 'a', court: 1, slot: 0 });
    const b = ob({ source: 'meet', id: 'b', court: 1, slot: 1 });
    const lanes = packBlockLanes([a, b]);
    expect(lanes.get('meet:a')!.laneCount).toBe(1);
    expect(lanes.get('meet:b')!.laneCount).toBe(1);
  });

  it('ignores unassigned (no court/slot) blocks', () => {
    const lanes = packBlockLanes([ob({ source: 'bracket', id: 'wait' })]);
    expect(lanes.get('bracket:wait')).toEqual({ laneIndex: 0, laneCount: 1 });
  });
});

/**
 * The invariant a court cannot break: one court plays ONE match at a time.
 *
 * This is asserted end to end (adapter -> live chips) rather than on
 * `actualStartSlot` alone, because the defect it guards was only visible at
 * the end of that chain. `msToSlot` reads time-of-day only, so a batch of
 * timestamps written at one instant — a seeding run, a clock skew, a restored
 * backup — derives ONE slot for every match that carries them. Live chips
 * anchor at that slot and are deliberately exempt from court pushback (they
 * are facts, and facts do not move), so the board rendered a dozen
 * simultaneous games on a single court and stated it with total confidence.
 *
 * The seeded demo is exactly this shape: 73 actual starts inside a 20-second
 * window, which is why the numbers below are a batch at one instant rather
 * than a comfortable pair either side of a threshold.
 */
describe('a court never renders two matches at once', () => {
  const oneCourt = (ids: string[]) =>
    ids.map((id) => ({ id, sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1' })) as any;

  // Three matches planned across the morning on court 1: 08:00, 09:00, 10:00.
  const schedule = {
    assignments: [
      { matchId: 'a', slotId: 0, courtId: 1, durationSlots: 1 },
      { matchId: 'b', slotId: 2, courtId: 1, durationSlots: 1 },
      { matchId: 'c', slotId: 4, courtId: 1, durationSlots: 1 },
    ],
  } as any;

  /** Every chip interval on a court, as [start, end) pairs. */
  function overlapsOn(chips: { placement: { courtIndex: number; startSlot: number; span: number } }[]) {
    const clashes: string[] = [];
    const byCourt = new Map<number, { start: number; end: number }[]>();
    for (const c of chips) {
      const list = byCourt.get(c.placement.courtIndex) ?? [];
      list.push({ start: c.placement.startSlot, end: c.placement.startSlot + c.placement.span });
      byCourt.set(c.placement.courtIndex, list);
    }
    for (const [court, list] of byCourt) {
      const sorted = [...list].sort((x, y) => x.start - y.start);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].start < sorted[i - 1].end) {
          clashes.push(`court ${court}: [${sorted[i - 1].start},${sorted[i - 1].end}) vs [${sorted[i].start},${sorted[i].end})`);
        }
      }
    }
    return clashes;
  }

  it('refuses a batch of same-instant stamps and falls back to the plan', () => {
    // All three "finished" at local 19:34 — 570 to 690 minutes from their
    // plans, well past the 240-minute drift ceiling. Local time so the
    // resolution is TZ-independent, matching this file's other timing tests.
    const at = (h: number, m: number) => new Date(2026, 0, 1, h, m).toISOString();
    const states = Object.fromEntries(
      ['a', 'b', 'c'].map((id) => [
        id,
        { matchId: id, status: 'finished', actualStartTime: at(19, 34), actualEndTime: at(19, 35) },
      ]),
    ) as any;

    const blocks = meetToOpsBlocks(oneCourt(['a', 'b', 'c']), schedule, states, {}, cfg);
    expect(blocks.map((b) => b.actualStartSlot)).toEqual([undefined, undefined, undefined]);

    const chips = buildLiveChips(blocks, 24, true);
    expect(overlapsOn(chips)).toEqual([]);
    // ...and back at the plan, which is where the truth actually is.
    expect(chips.map((c) => c.placement.startSlot)).toEqual([0, 2, 4]);
  });

  it('still believes a genuinely late match, so the live board keeps its point', () => {
    // Negative control. Without this, "ignore every actual" would pass the
    // test above while destroying the surface the fix exists to serve.
    const at = (h: number, m: number) => new Date(2026, 0, 1, h, m).toISOString();
    const states = {
      b: { matchId: 'b', status: 'finished', actualStartTime: at(10, 30), actualEndTime: at(11, 0) },
    } as any;

    const blocks = meetToOpsBlocks(oneCourt(['b']), schedule, states, {}, cfg);
    // Planned slot 2 (09:00), actually started 10:30 = slot 5. 90 minutes
    // late, inside the ceiling: a bad morning, not a clock artifact.
    expect(blocks[0].actualStartSlot).toBe(5);
    expect(buildLiveChips(blocks, 12, true)[0].placement.startSlot).toBe(5);
  });
});
