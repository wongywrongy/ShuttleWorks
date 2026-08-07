/**
 * Display vocabulary for the Entries desk (SP-E1-1).
 *
 * Pure lookups, kept out of the component so the mapping from wire code to
 * operator-facing words is testable on its own and stays in one place.
 *
 * Two of these tables mirror backend constants — spec §6's state machine and
 * `services/entries.py`'s `SkipReason`. Both lookups fall back to the RAW CODE
 * rather than to a placeholder: a code this build has never seen still means
 * something happened, and a desk that quietly rendered nothing would tell the
 * operator the entry was fine when the server said it wasn't.
 */
import type { EntryState } from '../../api/dto';
import type { PillTone } from '../../components/StatusPill';

/** The R7 soft-duplicate flag: same event + same email + same player name.
 *  It is a `pending_reasons` member, not a column — one list, one truth. */
export const NEEDS_REVIEW = 'needs_review';

export const ENTRY_STATE_LABEL: Record<EntryState, string> = {
  unverified: 'Unverified',
  pending: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
};

/** Tone by MEANING (DESIGN_COLOR): green is success/live and belongs to
 *  `confirmed` alone — a pending entry painted green reads as already handled.
 *  Everything still in play is neutral; the two dead-ends are `done`. */
export const ENTRY_STATE_TONE: Record<EntryState, PillTone> = {
  unverified: 'idle',
  pending: 'idle',
  confirmed: 'green',
  rejected: 'done',
  waitlisted: 'yellow',
  withdrawn: 'done',
};

const REASON_LABEL: Record<string, string> = {
  [NEEDS_REVIEW]: 'Needs review',
  awaiting_partner: 'Awaiting partner',
  awaiting_payment: 'Awaiting payment',
  over_cap: 'Over cap',
};

/** Human label for a `pendingReasons` code; unknown codes show verbatim. */
export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? code;
}

/** Does this entry carry the attention flag an operator must resolve? */
export function hasAttention(pendingReasons: readonly string[]): boolean {
  return pendingReasons.includes(NEEDS_REVIEW);
}

/** Mirrors `services/entries.py`'s `SkipReason`. Renaming one there is a
 *  contract change; the colocated test fails if this drifts. */
const SKIP_REASON_LABEL: Record<string, string> = {
  UNMAPPABLE_EVENT: 'Event code has no match in this workspace',
  DRAW_NOT_EDITABLE: 'The draw for that event is already generated',
  STATE_CONFLICT: 'Roster changed underneath the commit — try again',
  INVALID_PLAYER: 'Entry is missing a usable player name',
};

/** Human explanation for a commit skip; unknown codes show verbatim. */
export function skipReasonLabel(code: string): string {
  return SKIP_REASON_LABEL[code] ?? code;
}
