/**
 * The entrant's typing, surviving the "Update events and total" round trip.
 *
 * `POST /e/api/quote/{slug}` answers a native form post (`Accept: text/html`)
 * with a 303 whose `Location` is this page plus the posted body — minus
 * `_csrf`, `idempotencyKey` and `action` — plus the server's `totalCents` and
 * any refusal *code*. Parsing it here mirrors `parse_players`
 * (`services/entry_form.py`): the player fields repeat positionally, one entry
 * per rendered block, and each event checkbox is valued
 * `"<player index>:<event id>"`.
 *
 * **This query string is a shareable GET, and that is the threat model.** It
 * addresses the real entry page on the real tournament host, so anything it
 * renders verbatim is content a stranger can put in front of an entrant by
 * sending them a link — a plausible organiser warning, on a page about money.
 * React escapes it, so this was never XSS; it is that the URL is *reachable by
 * someone other than its author*. Hence: no free text crosses this boundary.
 * `refusalCode` is server vocabulary mapped here to FIXED local copy
 * (`refusalText`), an unknown code falls back to a generic sentence, and
 * `readCents` refuses anything that is not a non-negative integer rather than
 * letting `NaN` — or an invented number — reach the page.
 *
 * **`totalCents` is DISPLAY.** It is never posted onward, and the write path
 * runs `compute_fee_total` again (`api/entries_json.py:610`), so an edited URL
 * reaches no record. It is still rendered, so `readCents` still bounds it —
 * *below* and to an integer (a non-negative whole number of cents), which is
 * what that function actually does. Nothing here caps how LARGE the echoed
 * total may be: a link can still display an absurd figure, and the defence
 * against that is the recompute on the write path, not this parse.
 *
 * `narrowEvents` mirrors the incumbent's gender filter
 * (`api/entries_public.py:924`). It is presentational — a default view, not a
 * gate. A submitted mismatch is ACCEPTED and flagged for the organiser (R12),
 * and that decision stays Python-side in `check_policy`.
 *
 * No fee rule lives here. Every number is read, none is derived.
 */
import type { EntryEventDTO } from './entryPage.types';

export interface PlayerEcho {
  name: string;
  gender: string;
  club: string;
  birthYear: string;
  remarks: string;
  /** Raw `"<index>:<eventId>"` values, exactly as posted. */
  events: string[];
}

export interface FormEcho {
  players: PlayerEcho[];
  showAllEvents: boolean;
  totalCents: number | null;
  /** Fixed local copy chosen by `refusalText` — never text off the URL. */
  refusal: string | null;
}

/**
 * The generic answer. Shown for a code this build does not recognise, which
 * includes both a newer server's vocabulary and an invented one — those are
 * indistinguishable from here, so both get the safe sentence.
 */
const REFUSAL_UNKNOWN =
  'This selection cannot be entered as it stands. Check the limits stated above, then press "Update events and total" again.';

/**
 * Fixed copy for a refusal code from `check_policy` (`services/entry_policy.py`).
 *
 * A chain of literal comparisons rather than a lookup object on purpose: the
 * key is attacker-supplied, and `COPY[code]` with `code = 'constructor'` finds
 * something truthy on any plain object's prototype. Two codes do not need a
 * data structure.
 *
 * The copy states no *number*, and for `DISCIPLINE_CAP` it does not name the
 * discipline either. That is a limit of this channel, stated rather than
 * hidden: the echo carries a code and numeric subjects only, so the one thing
 * that would name the breached cap — the discipline string — is exactly the
 * free text this boundary exists to refuse. Putting it back in the URL under
 * an allowlist would work, but the client would still be guessing, and
 * recomputing the breach here from `policy.disciplineCaps` and the ticked
 * events would be a second implementation of `_discipline_breach`
 * (`services/entry_policy.py`) — the thing this app declines to do for the
 * fee, for the same reason.
 *
 * So R14's "state the rule" is answered where it belongs: by the form, from
 * the projection — "Up to N events per person" from `maxEventsPerPerson` AND
 * the per-discipline line from `policy.disciplineCaps` (`entry.form.tsx`).
 * Both are the director's own configuration rather than anything that rode in
 * on a URL, and the copy below points the entrant at them.
 */
function refusalCopy(code: string): string {
  if (code === 'MAX_EVENTS_PER_PERSON') {
    return 'That is more events than this tournament allows for one player. Remove some, then update the total again.';
  }
  if (code === 'DISCIPLINE_CAP') {
    return 'That is more events in one discipline than this tournament allows for one player. The per-discipline limits are stated on this page — remove some, then update the total again.';
  }
  return REFUSAL_UNKNOWN;
}

/**
 * The sentence to show for `?refusalCode=&refusalSubjects=`.
 *
 * `subjects` are `check_policy`'s player keys — the block index, as digits.
 * Anything that is not digits is dropped rather than rendered, which is the
 * whole point of this function: nothing an entrant (or a link) writes into the
 * query string reaches the page as prose.
 */
export function refusalText(code: string | null, subjects: string | null): string | null {
  if (code === null || code.trim() === '') return null;
  const copy = refusalCopy(code);
  const players = (subjects ?? '')
    .split(',')
    .filter((raw) => /^\d+$/.test(raw))
    .map((raw) => `Player ${Number(raw) + 1}`);
  return players.length === 0 ? copy : `${players.join(', ')} — ${copy}`;
}

/**
 * A non-negative integer, or nothing.
 *
 * `Number('')` is 0 and `Number('free')` is NaN; both would render, one as a
 * free entry and one as the string "NaN". Neither is a claim about money that
 * anyone made.
 */
function readCents(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseEcho(params: URLSearchParams): FormEcho {
  const names = params.getAll('playerName');
  const genders = params.getAll('gender');
  const clubs = params.getAll('club');
  const years = params.getAll('birthYear');
  const remarks = params.getAll('remarks');
  const chosen = params.getAll('events');

  return {
    players: names.map((name, index) => ({
      name,
      gender: genders[index] ?? '',
      club: clubs[index] ?? '',
      birthYear: years[index] ?? '',
      remarks: remarks[index] ?? '',
      // Split on the first colon and compare the index EXACTLY. A
      // `startsWith('1:')` test also matches `10:` and `11:`, which would
      // hand player 1 a tenth player's selections the day a third block
      // lands.
      events: chosen.filter((value) => value.slice(0, value.indexOf(':')) === String(index)),
    })),
    showAllEvents: params.get('showAllEvents') !== null,
    totalCents: readCents(params.get('totalCents')),
    refusal: refusalText(params.get('refusalCode'), params.get('refusalSubjects')),
  };
}

export function narrowEvents(
  events: EntryEventDTO[],
  gender: string,
  chosen: string[],
  showAll: boolean,
): EntryEventDTO[] {
  // No gender chosen yet is nothing to filter ON, not a mismatch with
  // everything (`api/entries_public.py:924`).
  if (showAll || gender.trim() === '') return events;

  const folded = gender.trim().toLowerCase();
  const ticked = new Set(chosen.map((value) => value.slice(value.indexOf(':') + 1)));

  return events.filter((event) => {
    // Hiding an event this player already ticked would silently un-tick it on
    // the next post — a selection dropped without anyone being told.
    if (ticked.has(event.id)) return true;
    const constraint = event.genderConstraint;
    if (constraint === null || constraint.toLowerCase() === 'mixed') return true;
    return constraint.toLowerCase() === folded;
  });
}
