/**
 * Shared match-status vocabulary — the read-only Done/Live/Ready/Pending
 * projection used by BOTH match lists (Meet Matches, Bracket Matches) and
 * their detail panels. Display-only: Operations owns run-state, so nothing
 * here is interactive and nothing writes.
 */
import type { PillTone, StatusCountItem } from '@scheduler/design-system/components';
import { STATE_WORD } from '../../lib/stateWords';

export type MatchListStatus = 'done' | 'live' | 'ready' | 'pending';

/** @deprecated Use MatchListStatus — kept so bracket call sites read naturally during migration. */
export type BracketMatchStatus = MatchListStatus;

export const STATUS_LABEL: Record<MatchListStatus, string> = {
  done: STATE_WORD.done,
  live: STATE_WORD.live,
  ready: STATE_WORD.ready,
  pending: STATE_WORD.pending,
};

/** Display order for the progress strips — worked-through first. */
const TALLY_ORDER: MatchListStatus[] = ['done', 'live', 'ready', 'pending'];

/**
 * `StatusBar` items for a draw/event tally, built once for the two bracket
 * progress strips (the draws-list Progress cell and the bracket view header).
 *
 * Zero-count tokens are suppressed — noise, not information (B2.1). Tones come
 * from `STATUS_PILL_TONE` so a state cannot read one color in a list and
 * another in a strip, which is exactly what had drifted: READY was blue in the
 * lists and amber here. `StatusCount` uppercases its label in CSS, so these
 * pass the canonical sentence-case words and still render DONE / LIVE / READY
 * / PENDING — the old hand-truncated "PEND" was a string, not a constraint.
 */
export function statusTallyItems(
  counts: Record<MatchListStatus, number>,
): StatusCountItem[] {
  return TALLY_ORDER.filter((s) => counts[s] > 0).map((s) => ({
    tone: STATUS_PILL_TONE[s],
    label: STATUS_LABEL[s],
    count: counts[s],
  }));
}

/** StatusPill tone per status (Console direction, 2026-08-13 — pills replaced
 *  the colored-text column): live = green, ready(scheduled) = blue, done and
 *  pending = neutral. One map so the two lists and both panels agree. */
export const STATUS_PILL_TONE: Record<MatchListStatus, PillTone> = {
  done: 'done',
  live: 'green',
  ready: 'blue',
  pending: 'idle',
};
