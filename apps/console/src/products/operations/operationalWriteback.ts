/**
 * Write-back routing for the unified Operations Live surface.
 *
 * When Meet and Bracket rows interleave on one surface, a live operator
 * action must reach the API of the engine that produced the row — Meet
 * goes through the command queue (`useCommandQueue`), Bracket through the
 * F3 bracket result queue (`useBracketResultQueue`). This module is the
 * pure dispatcher: it inspects `Match.source` and forwards to the matching
 * handler. The surface owns ONE router; the engines never cross wires (a meet
 * "start" must never hit the bracket queue).
 *
 * Per ADR 0006 the two engines keep separate match models, so the action
 * vocabulary is the shared subset each engine can honour — the handler
 * decides what (if anything) a given action means for its engine.
 */
import type { Match } from '../../platform/domain/match';

/** A live operator action requested against an operational row. */
export type OperationalAction =
  | { kind: 'call' }
  | { kind: 'start' }
  | { kind: 'finish' }
  | { kind: 'recordWinner'; winnerSide: 'A' | 'B' };

/** Per-engine write-back handlers — one surface owns one router. The
 *  return value (the queue's submit outcome promise, or nothing) is
 *  opaque to the dispatcher; callers fire-and-forget. */
export interface OperationalWritebackRouter {
  /** Meet rows → command queue (call / start / finish). */
  meet: (matchId: string, action: OperationalAction) => unknown;
  /** Bracket rows → F3 bracket result queue (record winner). */
  bracket: (matchId: string, action: OperationalAction) => unknown;
}

/** Dispatch a row's action to the handler for its originating engine. */
export function routeOperationalAction(
  row: Pick<Match, 'source' | 'id'>,
  action: OperationalAction,
  router: OperationalWritebackRouter,
): unknown {
  return row.source === 'meet'
    ? router.meet(row.id, action)
    : router.bracket(row.id, action);
}
