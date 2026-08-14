/**
 * Shared match-status vocabulary — the read-only Done/Live/Ready/Pending
 * projection used by BOTH match lists (Meet Matches, Bracket Matches) and
 * their detail panels. Display-only: Operations owns run-state, so nothing
 * here is interactive and nothing writes.
 */
import type { PillTone } from '@scheduler/design-system/components';

export type MatchListStatus = 'done' | 'live' | 'ready' | 'pending';

/** @deprecated Use MatchListStatus — kept so bracket call sites read naturally during migration. */
export type BracketMatchStatus = MatchListStatus;

export const STATUS_LABEL: Record<MatchListStatus, string> = {
  done: 'Done',
  live: 'Live',
  ready: 'Ready',
  pending: 'Pending',
};

/** StatusPill tone per status (Console direction, 2026-08-13 — pills replaced
 *  the colored-text column): live = green, ready(scheduled) = blue, done and
 *  pending = neutral. One map so the two lists and both panels agree. */
export const STATUS_PILL_TONE: Record<MatchListStatus, PillTone> = {
  done: 'done',
  live: 'green',
  ready: 'blue',
  pending: 'idle',
};
