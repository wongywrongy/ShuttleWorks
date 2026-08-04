/**
 * Shared match-status vocabulary — the read-only Done/Live/Ready/Pending
 * projection used by BOTH match lists (Meet Matches, Bracket Matches) and
 * their detail panels. Display-only: Operations owns run-state, so nothing
 * here is interactive and nothing writes.
 */
export type MatchListStatus = 'done' | 'live' | 'ready' | 'pending';

/** @deprecated Use MatchListStatus — kept so bracket call sites read naturally during migration. */
export type BracketMatchStatus = MatchListStatus;

export const STATUS_LABEL: Record<MatchListStatus, string> = {
  done: 'Done',
  live: 'Live',
  ready: 'Ready',
  pending: 'Pending',
};

export const STATUS_CLASS: Record<MatchListStatus, string> = {
  done: 'text-status-done',
  live: 'text-status-live',
  ready: 'text-status-warning',
  pending: 'text-muted-foreground',
};
