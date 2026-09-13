import stateMachines from '@scheduler/shared-contract/state-machines.json';
import { describe, it, expect } from 'vitest';
import { transition, can, fromEngineStatus, RUN_STATUS_LABEL, deriveLate, deriveTimeliness, deriveDriftSlots } from '../runtime/runMachine';

describe('runMachine', () => {
  it('walks the happy path call→start→record', () => {
    expect(transition('scheduled', 'call')).toBe('called');
    expect(transition('called', 'start')).toBe('playing');
    expect(transition('playing', 'record')).toBe('finished');
  });
  it('postpone returns called and playing to scheduled', () => {
    expect(transition('called', 'postpone')).toBe('scheduled');
    expect(transition('playing', 'postpone')).toBe('scheduled');
  });
  it('rejects illegal transitions with null', () => {
    expect(transition('scheduled', 'start')).toBeNull();   // must Call first
    expect(transition('finished', 'record')).toBeNull();        // terminal
    expect(transition('scheduled', 'record')).toBeNull();
  });
  it('assign keeps a queued match scheduled', () => {
    expect(transition('scheduled', 'assign')).toBe('scheduled');
  });
  it('can() mirrors transition feasibility', () => {
    expect(can('called', 'start')).toBe(true);
    expect(can('scheduled', 'start')).toBe(false);
  });
  it('maps engine vocab to RunStatus', () => {
    expect(fromEngineStatus('started')).toBe('playing');
    expect(fromEngineStatus('finished')).toBe('finished');
    expect(fromEngineStatus('called')).toBe('called');
  });
  it('labels use the canonical words', () => {
    // Contract §2: `playing` is "On court" — "Live" is a lifecycle/section
    // word, never a match state.
    expect(RUN_STATUS_LABEL).toMatchObject({
      scheduled: 'Scheduled', called: 'Called', playing: 'On court', finished: 'Done', retired: 'Retired',
    });
  });
});
describe('deriveLate', () => {
  it('is late when past planned start and still scheduled/called', () => {
    expect(deriveLate({ status: 'scheduled', plannedSlot: 2, currentSlot: 3 })).toBe(true);
    expect(deriveLate({ status: 'called', plannedSlot: 2, currentSlot: 2 })).toBe(true);
  });
  it('clears once playing (or done)', () => {
    expect(deriveLate({ status: 'playing', plannedSlot: 2, currentSlot: 9 })).toBe(false);
    expect(deriveLate({ status: 'finished', plannedSlot: 2, currentSlot: 9 })).toBe(false);
  });
  it('is not late before the planned start, or with no clock/plan', () => {
    expect(deriveLate({ status: 'scheduled', plannedSlot: 5, currentSlot: 3 })).toBe(false);
    expect(deriveLate({ status: 'scheduled', plannedSlot: undefined, currentSlot: 3 })).toBe(false);
    expect(deriveLate({ status: 'scheduled', plannedSlot: 5, currentSlot: undefined })).toBe(false);
  });
});
describe('deriveTimeliness', () => {
  it('is DUE, not late, on the match own planned slot', () => {
    // The bug this tier exists to kill: the board read "LATE +0" the instant
    // a match slot began, because the old boolean was `current >= planned`.
    expect(deriveTimeliness({ status: 'scheduled', plannedSlot: 4, currentSlot: 4 })).toBe('due');
    expect(deriveTimeliness({ status: 'called', plannedSlot: 4, currentSlot: 4 })).toBe('due');
  });
  it('escalates by whole slots: 1 past is late, 2+ past is overdue', () => {
    expect(deriveTimeliness({ status: 'scheduled', plannedSlot: 4, currentSlot: 5 })).toBe('late');
    expect(deriveTimeliness({ status: 'scheduled', plannedSlot: 4, currentSlot: 6 })).toBe('overdue');
    expect(deriveTimeliness({ status: 'called', plannedSlot: 0, currentSlot: 9 })).toBe('overdue');
  });
  it('is on time before the slot, once playing/done, or with no clock or plan', () => {
    expect(deriveTimeliness({ status: 'scheduled', plannedSlot: 5, currentSlot: 3 })).toBe('ontime');
    expect(deriveTimeliness({ status: 'playing', plannedSlot: 2, currentSlot: 9 })).toBe('ontime');
    expect(deriveTimeliness({ status: 'finished', plannedSlot: 2, currentSlot: 9 })).toBe('ontime');
    expect(deriveTimeliness({ status: 'scheduled', plannedSlot: undefined, currentSlot: 3 })).toBe('ontime');
    expect(deriveTimeliness({ status: 'scheduled', plannedSlot: 5, currentSlot: undefined })).toBe('ontime');
  });
  it('keeps deriveLate exactly as wide as it was — DUE still counts', () => {
    // The summary band and the Plan chips read `late`; widening or narrowing
    // it here would silently move a count nobody asked to move.
    expect(deriveLate({ status: 'scheduled', plannedSlot: 4, currentSlot: 4 })).toBe(true);
  });
});
describe('deriveDriftSlots', () => {
  it('counts slots a playing match runs past its planned end', () => {
    expect(deriveDriftSlots({ status: 'playing', plannedSlot: 2, span: 1, currentSlot: 5 })).toBe(2);
    expect(deriveDriftSlots({ status: 'playing', plannedSlot: 2, span: 1, currentSlot: 3 })).toBe(0);
    expect(deriveDriftSlots({ status: 'called', plannedSlot: 2, span: 1, currentSlot: 9 })).toBe(0);
  });
});


describe('exported match graph', () => {
  const match = stateMachines.machines.match;
  it('uses every canonical state and every backend transition', () => {
    expect(Object.keys(RUN_STATUS_LABEL).sort()).toEqual([...match.states].sort());
    for (const edge of match.transitions) {
      for (const source of edge.from_states) {
        expect(transition(source as Parameters<typeof transition>[0], edge.event as Parameters<typeof transition>[1])).toBe(edge.to);
      }
    }
  });
  it('preserves retirement and makes it terminal', () => {
    expect(fromEngineStatus('retired')).toBe('retired');
    for (const edge of match.transitions) expect(edge.from_states).not.toContain('retired');
  });
});
