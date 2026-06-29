import { describe, it, expect } from 'vitest';
import { transition, can, fromEngineStatus, RUN_STATUS_LABEL } from '../runtime/runMachine';

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
