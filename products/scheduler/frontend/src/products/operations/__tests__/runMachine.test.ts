import { describe, it, expect } from 'vitest';
import { transition, can, fromEngineStatus, RUN_STATUS_LABEL, deriveLate, deriveDriftSlots } from '../runtime/runMachine';

describe('runMachine', () => {
  it('walks the happy path call→start→record', () => {
    expect(transition('scheduled', 'call')).toBe('called');
    expect(transition('called', 'start')).toBe('playing');
    expect(transition('playing', 'record')).toBe('done');
  });
  it('postpone returns called and playing to scheduled', () => {
    expect(transition('called', 'postpone')).toBe('scheduled');
    expect(transition('playing', 'postpone')).toBe('scheduled');
  });
  it('rejects illegal transitions with null', () => {
    expect(transition('scheduled', 'start')).toBeNull();   // must Call first
    expect(transition('done', 'record')).toBeNull();        // terminal
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
    expect(fromEngineStatus('finished')).toBe('done');
    expect(fromEngineStatus('called')).toBe('called');
  });
  it('labels use the canonical words', () => {
    expect(RUN_STATUS_LABEL).toMatchObject({
      scheduled: 'Scheduled', called: 'Called', playing: 'Playing', done: 'Done',
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
    expect(deriveLate({ status: 'done', plannedSlot: 2, currentSlot: 9 })).toBe(false);
  });
  it('is not late before the planned start, or with no clock/plan', () => {
    expect(deriveLate({ status: 'scheduled', plannedSlot: 5, currentSlot: 3 })).toBe(false);
    expect(deriveLate({ status: 'scheduled', plannedSlot: undefined, currentSlot: 3 })).toBe(false);
    expect(deriveLate({ status: 'scheduled', plannedSlot: 5, currentSlot: undefined })).toBe(false);
  });
});
describe('deriveDriftSlots', () => {
  it('counts slots a playing match runs past its planned end', () => {
    expect(deriveDriftSlots({ status: 'playing', plannedSlot: 2, span: 1, currentSlot: 5 })).toBe(2);
    expect(deriveDriftSlots({ status: 'playing', plannedSlot: 2, span: 1, currentSlot: 3 })).toBe(0);
    expect(deriveDriftSlots({ status: 'called', plannedSlot: 2, span: 1, currentSlot: 9 })).toBe(0);
  });
});
