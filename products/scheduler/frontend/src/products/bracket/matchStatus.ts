/**
 * Bracket match status vocabulary — the read-only Done/Live/Ready/Pending
 * projection shared by the Matches list rows and the match detail panel
 * (SP-D7 S4). Display-only: Operations owns run-state, so nothing here is
 * interactive and nothing writes.
 */
export type BracketMatchStatus = 'done' | 'live' | 'ready' | 'pending';

export const STATUS_LABEL: Record<BracketMatchStatus, string> = {
  done: 'Done',
  live: 'Live',
  ready: 'Ready',
  pending: 'Pending',
};

export const STATUS_CLASS: Record<BracketMatchStatus, string> = {
  done: 'text-status-done',
  live: 'text-status-live',
  ready: 'text-status-warning',
  pending: 'text-muted-foreground/70',
};
