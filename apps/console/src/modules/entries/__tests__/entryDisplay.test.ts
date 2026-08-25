/**
 * The Entries desk's display vocabulary (SP-E1-1).
 *
 * Pure lookups, but load-bearing ones: these codes cross the HTTP boundary
 * from `services/entries.py` (`SkipReason`) and the spec §6 state machine, so
 * the tests below are as much a record of the wire vocabulary as they are a
 * check on the maps.
 *
 * The rule the fallbacks encode: an unrecognized code is SHOWN, never hidden.
 * A desk that silently dropped a reason it didn't know would tell the operator
 * an entry was fine when the server said otherwise.
 */
import { describe, expect, it } from 'vitest';
import {
  ENTRY_STATE_LABEL,
  ENTRY_STATE_TONE,
  GENDER_MISMATCH,
  NEEDS_REVIEW,
  formatCents,
  groupBySubmission,
  hasAttention,
  reasonLabel,
  skipReasonLabel,
} from '../entryDisplay';
import type { EntryDTO, EntryState } from '../../../api/dto';

function entry(id: string, submissionId: string | null, email = 'a@b.c'): EntryDTO {
  return {
    id,
    entryEventId: 'ev-1',
    eventCode: 'MS',
    state: 'pending',
    pendingReasons: [],
    submission: submissionId
      ? {
          id: submissionId,
          accountEmail: email,
          accountName: null,
          feeTotalCents: 4000,
          submittedAt: null,
        }
      : null,
    playerName: 'Alice Chen',
    remarks: null,
    listOptOut: false,
    committedPlayerId: null,
    submittedAt: null,
    withdrawnAt: null,
  };
}

const ALL_STATES: EntryState[] = [
  'unverified',
  'pending',
  'confirmed',
  'rejected',
  'waitlisted',
  'withdrawn',
];

describe('entry state vocabulary', () => {
  it('labels and tones every state in the spec §6 machine', () => {
    for (const state of ALL_STATES) {
      expect(ENTRY_STATE_LABEL[state]).toBeTruthy();
      expect(ENTRY_STATE_TONE[state]).toBeTruthy();
    }
  });

  it('reserves the green (live) tone for confirmed only', () => {
    // DESIGN_COLOR: green means success/live. A pending entry is not a
    // success, and colouring it green would read as "already handled".
    const green = ALL_STATES.filter((s) => ENTRY_STATE_TONE[s] === 'green');
    expect(green).toEqual(['confirmed']);
  });
});

describe('pending reasons', () => {
  it('gives the R7 soft-duplicate flag a human label', () => {
    expect(reasonLabel(NEEDS_REVIEW)).toMatch(/review/i);
  });

  it('shows an unknown reason code verbatim rather than hiding it', () => {
    expect(reasonLabel('SOME_FUTURE_REASON')).toBe('SOME_FUTURE_REASON');
  });

  it('gives the R12 gender-mismatch flag a human label', () => {
    expect(reasonLabel(GENDER_MISMATCH)).toMatch(/gender/i);
  });

  it('hasAttention is true for the reasons that are a question for the operator', () => {
    // **Widened by R12 / Q14 §5.** This test read "true only when
    // needs_review is present"; `gender_mismatch` is the second reason of
    // the same kind — the software noticed something and refused to decide
    // it (invariant I4) — so it earns the same treatment. The negative
    // control is unchanged and is the whole point: reasons that are a state
    // of the world rather than a question (a payment that has not arrived,
    // a partner who has not answered) must NOT light up as attention.
    expect(hasAttention([NEEDS_REVIEW])).toBe(true);
    expect(hasAttention([GENDER_MISMATCH])).toBe(true);
    expect(hasAttention([NEEDS_REVIEW, 'over_cap'])).toBe(true);
    expect(hasAttention(['over_cap'])).toBe(false);
    expect(hasAttention(['awaiting_payment', 'awaiting_partner'])).toBe(false);
    expect(hasAttention([])).toBe(false);
  });

  it('labels the workspace-scoped duplicate advisory and treats it as attention', () => {
    expect(reasonLabel('needs_review_person')).toBe('Possible duplicate person');
    expect(hasAttention(['needs_review_person'])).toBe(true);
  });
});

describe('money', () => {
  it('renders cents as major units with no invented currency symbol', () => {
    // There is no currency field anywhere in this schema; a `$` would be a
    // lie with a symbol on it.
    expect(formatCents(5500)).toBe('55.00');
    expect(formatCents(0)).toBe('0.00');
  });

  it('renders nothing at all when nothing is priced', () => {
    // NOT '0.00'. A tournament that configured no prices has not declared
    // its entries free, and the backend deliberately sends null rather than
    // zero for exactly that reason.
    expect(formatCents(null)).toBeNull();
    expect(formatCents(undefined)).toBeNull();
  });
});

describe('grouping by submission (ruling R13)', () => {
  it('bands entries that arrived on one form', () => {
    const groups = groupBySubmission([
      entry('e-1', 'sub-1'),
      entry('e-2', 'sub-1'),
      entry('e-3', 'sub-2', 'other@club.org'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['sub-1', 'sub-2']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['e-1', 'e-2']);
    expect(groups[1].accountEmail).toBe('other@club.org');
    expect(groups[0].feeTotalCents).toBe(4000);
  });

  it("keeps the server's order rather than forming a second opinion", () => {
    // The list arrives newest-first with a stable tiebreaker the backend
    // documents. Re-sorting here would compete with it, and an operator's
    // place on the page would move under them between reads.
    const groups = groupBySubmission([
      entry('e-3', 'sub-2'),
      entry('e-1', 'sub-1'),
      entry('e-2', 'sub-2'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['sub-2', 'sub-1']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['e-3', 'e-2']);
  });

  it('gives an entry with no act a band of its own', () => {
    // Nothing the writer produces looks like this. If one ever appears,
    // such entries have nothing in common except the thing they are
    // missing, so a shared "no act" bucket would be a false grouping.
    const groups = groupBySubmission([entry('e-1', null), entry('e-2', null)]);
    expect(groups).toHaveLength(2);
    expect(groups[0].accountEmail).toBeNull();
  });
});

describe('commit skip reasons', () => {
  it('labels every code services/entries.py can emit', () => {
    // Mirrors `SkipReason` — renaming one there is a contract change and
    // must break here.
    for (const code of [
      'UNMAPPABLE_EVENT',
      'DRAW_NOT_EDITABLE',
      'STATE_CONFLICT',
      'INVALID_PLAYER',
    ]) {
      expect(skipReasonLabel(code)).not.toBe(code);
      expect(skipReasonLabel(code).length).toBeGreaterThan(0);
    }
  });

  it('shows an unknown skip code verbatim rather than swallowing it', () => {
    // A skip the desk cannot explain is still a roster player the operator
    // did NOT get. Showing the raw code is worse copy and better information.
    expect(skipReasonLabel('NEW_BACKEND_REASON')).toBe('NEW_BACKEND_REASON');
  });
});
