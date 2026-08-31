import { describe, expect, it } from 'vitest';
import { effectivePlanPolicy, hasAuthoritativeAssignment, resolvePlanView } from '../plan/planView';

const assigned = { court: 2, slot: 4 };
const unassigned = { court: undefined, slot: undefined };

describe('Plan spatial view policy', () => {
  it.each([
    ['Meet · in progress', 'in-progress'],
    ['Meet · complete', 'complete'],
    ['Bracket · in progress', 'in-progress'],
    ['Bracket · complete', 'complete'],
  ])('%s keeps the grid decision independent of lifecycle', () => {
    // Lifecycle is intentionally not an input: a complete day still reviews
    // its authoritative spatial history instead of silently changing modes.
    expect(resolvePlanView([assigned], null, null).mode).toBe('grid');
    expect(resolvePlanView([unassigned], null, null).mode).toBe('list');
  });

  it('uses the queue call list until the solve explicitly reports pinned fallback', () => {
    const queueConfig = { courtPolicy: 'queue' as const };
    expect(resolvePlanView([assigned], queueConfig, null).mode).toBe('call-list');
    expect(resolvePlanView([assigned], queueConfig, { effectivePolicy: 'queue' }).mode).toBe('call-list');
    expect(resolvePlanView([assigned], queueConfig, { effectivePolicy: 'pinned' }).mode).toBe('grid');
  });

  it('keeps unassigned matches visible without fabricating a placement', () => {
    const decision = resolvePlanView([assigned, unassigned], null, null);
    expect(decision).toMatchObject({ mode: 'grid', assignedCount: 1, unassignedCount: 1 });
    expect(hasAuthoritativeAssignment(unassigned)).toBe(false);
  });

  it('treats omitted policy as pinned for bracket and legacy schedules', () => {
    expect(effectivePlanPolicy(null, null)).toBe('pinned');
    expect(effectivePlanPolicy({ courtPolicy: 'pinned' }, null)).toBe('pinned');
    expect(effectivePlanPolicy({ courtPolicy: 'pinned' }, { effectivePolicy: 'queue' })).toBe('queue');
  });
});
