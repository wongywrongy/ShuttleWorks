/**
 * The unified Operations Live surface owns ONE write-back router; each
 * row's live action must route to the API of the engine that produced it
 * (`OperationalMatch.source`). Meet → command queue; Bracket → the F3
 * bracket result queue. These tests pin that routing so a future refactor
 * can't cross the wires (a meet "start" must never hit the bracket queue).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  routeOperationalAction,
  type OperationalWritebackRouter,
} from '../operationalWriteback';
import type { OperationalMatch } from '../../../lib/operations/operationalMatch';

function makeRouter() {
  const meet = vi.fn();
  const bracket = vi.fn();
  const router: OperationalWritebackRouter = { meet, bracket };
  return { meet, bracket, router };
}

const meetRow: OperationalMatch = {
  id: 'm1',
  source: 'meet',
  courtLabel: 'C1',
  slot: 0,
  sideA: 'Alice',
  sideB: 'Bob',
  status: 'scheduled',
};

const bracketRow: OperationalMatch = {
  id: 'pu1',
  source: 'bracket',
  courtLabel: 'C1',
  slot: 0,
  sideA: 'A',
  sideB: 'B',
  status: 'started',
};

describe('routeOperationalAction', () => {
  it('routes a meet row to the meet handler only', () => {
    const { meet, bracket, router } = makeRouter();
    routeOperationalAction(meetRow, { kind: 'start' }, router);
    expect(meet).toHaveBeenCalledWith('m1', { kind: 'start' });
    expect(bracket).not.toHaveBeenCalled();
  });

  it('routes a bracket row to the bracket handler only', () => {
    const { meet, bracket, router } = makeRouter();
    routeOperationalAction(bracketRow, { kind: 'recordWinner', winnerSide: 'A' }, router);
    expect(bracket).toHaveBeenCalledWith('pu1', { kind: 'recordWinner', winnerSide: 'A' });
    expect(meet).not.toHaveBeenCalled();
  });

  it('passes the action payload through unchanged for finish', () => {
    const { meet, router } = makeRouter();
    routeOperationalAction(meetRow, { kind: 'finish' }, router);
    expect(meet).toHaveBeenCalledWith('m1', { kind: 'finish' });
  });
});
