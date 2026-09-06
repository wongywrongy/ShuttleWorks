/**
 * The canonical match-state model (contract §2) — the state set, the
 * derivation of the two console-only readiness values (`pending`/`ready`),
 * and the one labeller other surfaces call instead of inventing their own
 * words. Imports its labels from `lib/stateWords.ts` (the authority for the
 * words themselves) rather than spelling any of them again here.
 *
 * `pending` and `ready` are DERIVED, never persisted — the backend does not
 * carry them and must not start to (§2.1: the derivation lives with the
 * domain that knows the prerequisite: Bracket feeders, Entries pair
 * completeness). This module only defines the shape of that derivation and
 * the label; it does not itself know a match's prerequisites.
 */
import { STATE_WORD } from '../../lib/stateWords';
import type { MatchStatus as EngineStatus } from './match';

/** The five persisted statuses, engine spelling (`started` = playing). */
export type PersistedMatchStatus = EngineStatus | 'retired';

/** The two derived-only readiness values — never written to the wire as if
 * they were a persisted status (§2.1). */
export type DerivedReadiness = 'pending' | 'ready';

export type MatchStateValue = PersistedMatchStatus | DerivedReadiness;

/** Everything this module needs to know to answer "pending or ready": every
 * prerequisite question collapses to one boolean per match, decided by the
 * caller (Bracket feeders, Entries pair completeness, whatever domain owns
 * the specific prerequisite). */
export interface ReadinessInput {
  /** True when every prerequisite is met and the match could be called. */
  eligible: boolean;
}

/** `pending` when a prerequisite is unmet, `ready` otherwise (§2.1). Only
 * meaningful for a match still in the `scheduled` resting state — a called,
 * playing or terminal match is never re-derived through this function. */
export function deriveReadiness(input: ReadinessInput): DerivedReadiness {
  return input.eligible ? 'ready' : 'pending';
}

const MATCH_STATE_LABEL: Record<MatchStateValue, string> = {
  pending: STATE_WORD.pending,
  ready: STATE_WORD.ready,
  scheduled: STATE_WORD.scheduled,
  called: STATE_WORD.called,
  started: STATE_WORD.onCourt,
  finished: STATE_WORD.done,
  retired: STATE_WORD.retired,
};

/** The one match-state labeller. Every surface renders a match state through
 * this function rather than switching on the raw string itself. */
export function matchStateLabel(state: MatchStateValue): string {
  return MATCH_STATE_LABEL[state];
}
