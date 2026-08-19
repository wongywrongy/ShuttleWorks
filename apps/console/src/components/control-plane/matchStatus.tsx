/**
 * Shared match-status vocabulary — the read-only Done/Live/Ready/Pending
 * projection used by BOTH match lists (Meet Matches, Bracket Matches) and
 * their detail panels. Display-only: Operations owns run-state, so nothing
 * here is interactive and nothing writes.
 */
import type { PillTone, StatusCountItem } from '@scheduler/design-system/components';
import { STATE_WORD } from '../../lib/stateWords';
import { StatusPill } from '../StatusPill';
import { EYEBROW_CLASS } from '../../lib/utils';

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

/** StatusPill tone per status. Since X6 only LIVE actually chips in the
 *  lists/panels (via `MatchStatus`); the map keeps all four states because
 *  `statusTallyItems` still tones the StatusBar progress strips with it. */
export const STATUS_PILL_TONE: Record<MatchListStatus, PillTone> = {
  done: 'done',
  live: 'green',
  ready: 'blue',
  pending: 'idle',
};

/**
 * X6 status ink budget (SP-CONSOLE-3): containers are reserved for
 * exceptional, time-sensitive states — in this four-state vocabulary only
 * LIVE chips. READY / PENDING carry ink weight, not a border. DONE has a
 * text fallback here, but a finished row with a recorded score renders the
 * ScoreLane INSTEAD of this component (X6-D: the score is the status) —
 * the fallback exists so a done match with no recorded score never shows
 * an empty cell that lies about its state.
 *
 * `STATUS_TREATMENT` is exported for the X6 property test, but the test
 * asserts the RENDERED output too — flipping a text state to 'chip' here
 * must fail the DOM assertions, not just mirror a map.
 */
export const STATUS_TREATMENT: Record<MatchListStatus, 'chip' | 'text'> = {
  done: 'text',
  live: 'chip',
  ready: 'text',
  pending: 'text',
};

/** Text-state ladder: one ink (muted — no fainter checked ink exists;
 *  `--ink-faint` aliases `--text-muted`), two weights. READY keeps the
 *  eyebrow's semibold; PENDING and the DONE fallback drop to normal, one
 *  visible step quieter without a new unchecked color. */
const TEXT_CLASS: Record<MatchListStatus, string> = {
  done: 'text-2xs uppercase tracking-[0.08em] text-muted-foreground',
  live: '',
  ready: `${EYEBROW_CLASS} text-muted-foreground`,
  pending: 'text-2xs uppercase tracking-[0.08em] text-muted-foreground',
};

/** The one status renderer for the match lists and their detail panels. */
export function MatchStatus({ status }: { status: MatchListStatus }) {
  if (STATUS_TREATMENT[status] === 'chip') {
    return (
      <StatusPill tone={STATUS_PILL_TONE[status]} dot>
        {STATUS_LABEL[status]}
      </StatusPill>
    );
  }
  return <span className={TEXT_CLASS[status]}>{STATUS_LABEL[status]}</span>;
}
