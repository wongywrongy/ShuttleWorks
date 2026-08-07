/**
 * The entrant's typing, surviving the "Update events and total" round trip.
 *
 * `POST /e/api/quote/{slug}` answers a native form post (`Accept: text/html`)
 * with a 303 whose `Location` is this page plus the posted body — minus
 * `_csrf`, `idempotencyKey` and `action` — plus the server's `totalCents` and
 * any refusal. Parsing it here mirrors `parse_players`
 * (`services/entry_form.py`): the player fields repeat positionally, one entry
 * per rendered block, and each event checkbox is valued
 * `"<player index>:<event id>"`.
 *
 * **`totalCents` is DISPLAY.** It is never posted onward, and the write path
 * runs `compute_fee_total` again (`api/entries_json.py:610`), so an edited URL
 * changes what its editor reads and nothing that is recorded. It is also
 * entrant-editable, which is why `readCents` refuses anything that is not a
 * non-negative integer rather than letting `NaN` reach a page about money.
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
  refusal: string | null;
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
    refusal: params.get('refusal'),
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
