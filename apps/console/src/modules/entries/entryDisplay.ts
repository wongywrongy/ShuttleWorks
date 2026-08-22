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
import type { EntryDTO, EntryState } from '../../api/dto';
import type { PillTone } from '../../components/StatusPill';

/** The R7 soft-duplicate flag: same event + same player name, across
 *  submissions. It is a `pending_reasons` member, not a column — one list,
 *  one truth.
 *
 *  (R13 retargeted the conjunction: R7 spelled the second half as "same
 *  normalized email", which the account level made both wrong — one
 *  account is now *expected* to appear repeatedly — and unnecessary, since
 *  the player is a row rather than a repeated string.) */
export const NEEDS_REVIEW = 'needs_review';

/** R12 / Q14 §5: the player's gender does not match the event's
 *  constraint. **Accepted, never refused** — the form filters by default
 *  and offers an override, and the operator resolves what comes through.
 *  An entry-level pending reason on the `needs_review` precedent, not one
 *  of the workspace attention codes. */
export const GENDER_MISMATCH = 'gender_mismatch';

/** E3 / spec Q6: the named partner is already spoken for in this event, so
 *  BOTH halves of the ambiguity carry this. The software cannot know which
 *  pairing is the mistake — guessing would silently break a pair that had
 *  already agreed — so it flags and an operator decides (invariant I4). */
export const PAIR_CONFLICT = 'pair_conflict';

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
  [GENDER_MISMATCH]: 'Gender mismatch',
  [PAIR_CONFLICT]: 'Pair conflict',
  awaiting_partner: 'Awaiting partner',
  awaiting_payment: 'Awaiting payment',
  over_cap: 'Over cap',
};

/** Human label for a `pendingReasons` code; unknown codes show verbatim. */
export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? code;
}

/** The reasons that are a QUESTION FOR THE OPERATOR rather than a state of
 *  the world. Both of these mean "the software noticed something and
 *  refused to decide it" (invariant I4), which is exactly what deserves the
 *  warning treatment; `awaiting_payment` and `awaiting_partner` are things
 *  waiting to happen and are not.
 *
 *  `pair_conflict` (E3) joined them for the same reason: two entrants have
 *  named the same partner, nothing about that resolves on its own, and the
 *  entry sits there until a human picks. */
const ATTENTION = new Set([NEEDS_REVIEW, GENDER_MISMATCH, PAIR_CONFLICT]);

/** Does this entry carry a flag an operator must resolve? */
export function hasAttention(pendingReasons: readonly string[]): boolean {
  return pendingReasons.some((code) => ATTENTION.has(code));
}

/** Cents as major units, with no currency symbol.
 *
 *  Mirrors the public page's `_money` and its reasoning: there is no
 *  currency field anywhere in this schema, and rendering a `$` would be a
 *  lie with a symbol on it. Money is E5; this is the display the desk
 *  needs and no more. */
export function formatCents(cents: number | null | undefined): string | null {
  return cents == null ? null : (cents / 100).toFixed(2);
}

/** One form act and the entries that arrived on it (R13). */
export interface EntryGroup {
  /** The submission id, or a per-entry fallback for the shape the wire
   *  allows and the writer never produces. */
  key: string;
  accountEmail: string | null;
  feeTotalCents: number | null;
  entries: EntryDTO[];
}

/** Band the desk list by the act each entry arrived on.
 *
 *  **Order is the server's, untouched.** The list arrives newest-first with
 *  a stable tiebreaker; this walks it once and opens a band the first time
 *  it meets a submission, so an operator's place on the page survives a
 *  re-read. Sorting here would be a second ordering opinion competing with
 *  the one the backend documents.
 *
 *  Entries with no submission each get their own band rather than sharing a
 *  "no act" bucket: they would have nothing in common except the thing they
 *  are missing. */
export function groupBySubmission(entries: readonly EntryDTO[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  const byKey = new Map<string, EntryGroup>();
  for (const entry of entries) {
    const key = entry.submission ? entry.submission.id : `entry:${entry.id}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        accountEmail: entry.submission?.accountEmail ?? null,
        feeTotalCents: entry.submission?.feeTotalCents ?? null,
        entries: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Mirrors `services/entries.py`'s `SkipReason`. Renaming one there is a
 *  contract change; the colocated test fails if this drifts. */
const SKIP_REASON_LABEL: Record<string, string> = {
  UNMAPPABLE_EVENT: 'Event code has no match in this workspace',
  DRAW_NOT_EDITABLE: 'The draw for that event is already generated',
  STATE_CONFLICT: 'Roster changed underneath the commit. Try again',
  INVALID_PLAYER: 'Entry is missing a usable player name',
};

/** Human explanation for a commit skip; unknown codes show verbatim. */
export function skipReasonLabel(code: string): string {
  return SKIP_REASON_LABEL[code] ?? code;
}
