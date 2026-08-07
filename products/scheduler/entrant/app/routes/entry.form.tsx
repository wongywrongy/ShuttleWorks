/**
 * The multi-event entry form (R12/R13/R14), rendered to work with no script.
 *
 * **It posts straight to FastAPI, not to a React Router action.** Every
 * entrant write is browser → nginx → FastAPI on one origin. If node relayed
 * the write, the `X-ShuttleWorks-CSRF` header would stop proving "a
 * same-origin browser sent this" and start proving only "a node process asked"
 * — so there is no `action` export anywhere in this tier, by design.
 *
 * The transport shape is the incumbent's, verbatim, because the parser is
 * unchanged: player fields repeat positionally and each event checkbox is
 * valued `"<player index>:<event id>"` (`services/entry_form.parse_players`).
 * A fixed two blocks rather than an "add another player" button, for the same
 * reason it was fixed before — growing a form needs script or a round trip,
 * and a spare block is cheaper than either. A block with no name, gender or
 * events is dropped by the parser, so the empty second block is free.
 *
 * **Gender is a native `<select>`, not the design system's `Select`.** That
 * component wraps Radix, which renders a `<button>` driven by `onValueChange`
 * — nothing submits without hydration. `TextField` is used as-is: it spreads
 * `...inputProps` onto a real `<input>`, so `name` and `required` reach the
 * DOM.
 *
 * **No fee is computed here** (R14). Per-event prices are cents from the
 * projection, formatted; the total is the server's, from the same
 * `compute_fee_total` the write uses.
 */
import { Button, Card, CardContent, Separator, TextField } from '@scheduler/design-system/components';

import { formatCents } from '../lib/money';
import type { EntryEventDTO, EntryPageDTO } from '../lib/entryPage.types';

export interface EntryFormProps {
  page: EntryPageDTO;
  idempotencyKey: string;
}

/**
 * The positional contract with `parse_players`: block N's inputs are read at
 * index N of every repeated field. Frozen because module scope in this SSR
 * process is shared by every concurrent entrant — see
 * `moduleScopedMutableBindings` in `tests/helpers/sourceGuards.ts`.
 */
const PLAYER_BLOCKS = Object.freeze([
  { index: 0, heading: 'Player', required: true },
  { index: 1, heading: 'Second player (optional)', required: false },
] as const);

const GENDERS = Object.freeze([
  ['', '—'],
  ['F', 'Female'],
  ['M', 'Male'],
] as const);

function PlayerBlock({
  index,
  heading,
  required,
  events,
  askBirthYear,
}: {
  index: number;
  heading: string;
  required: boolean;
  events: EntryEventDTO[];
  askBirthYear: boolean;
}) {
  const prefix = `p${index}`;
  return (
    <Card className="p-4">
      <CardContent className="grid gap-3 p-0">
        <h3 className="text-sm font-semibold">{heading}</h3>

        <TextField
          id={`${prefix}name`}
          label="Full name"
          name="playerName"
          maxLength={200}
          required={required}
          autoComplete="name"
        />

        <div>
          <label
            htmlFor={`${prefix}gender`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Gender
          </label>
          <select
            id={`${prefix}gender`}
            name="gender"
            required={required}
            defaultValue=""
            className="h-9 w-full rounded-sm border border-rule-control bg-bg-elev px-3 text-sm text-foreground"
          >
            {GENDERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          id={`${prefix}club`}
          label="Club (optional)"
          name="club"
          maxLength={200}
          autoComplete="organization"
        />

        {askBirthYear ? (
          <TextField
            id={`${prefix}year`}
            label="Birth year"
            name="birthYear"
            inputMode="numeric"
            maxLength={4}
            hint="This tournament runs age-bracketed events, so the organiser needs a year to place this player."
          />
        ) : (
          // Positional round-trip: the parser reads these lists by index, so a
          // block that omitted the input would shift every later player's year
          // onto the wrong person.
          <input type="hidden" name="birthYear" value="" />
        )}

        <div>
          <label
            htmlFor={`${prefix}remarks`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Anything the organiser should know (optional)
          </label>
          <textarea
            id={`${prefix}remarks`}
            name="remarks"
            rows={2}
            maxLength={2000}
            placeholder="e.g. can't play before 6pm Saturday"
            className="w-full rounded-sm border border-rule-control bg-bg-elev p-2 text-sm text-foreground"
          />
        </div>

        <fieldset className="grid gap-1">
          <legend className="mb-1 text-xs font-medium text-foreground">Events</legend>
          {events.map((event) => (
            <label
              key={event.id}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <input type="checkbox" name="events" value={`${index}:${event.id}`} />
              <span>
                {event.discipline} ({event.code})
              </span>
              {event.feeCents === null ? null : (
                <span className="text-xs text-muted-foreground">
                  {formatCents(event.feeCents)}
                </span>
              )}
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}

export function EntryForm({ page, idempotencyKey }: EntryFormProps) {
  const openEvents = page.events.filter((event) => event.isOpen);
  const askBirthYear = openEvents.some((event) => event.ageBracketed);
  const cap = page.policy.maxEventsPerPerson;
  // Display only: the server-supplied bundle schedule, formatted verbatim.
  // No arithmetic — `compute_fee_total` decides what a multi-event entrant
  // actually pays, and R14 requires stating that rule before submission.
  const feeTiers = Object.entries(page.page.feeSchedule).sort(
    ([a], [b]) => Number(a) - Number(b),
  );

  return (
    <form
      method="post"
      action={`/e/api/submit/${page.page.slug}`}
      encType="application/x-www-form-urlencoded"
      className="grid gap-4"
    >
      {/* Channel two: the double-submit token, so an unhydrated form still
          proves a same-origin browser sent this. The value is the
          projection's — never re-derived here. `_csrf` is the backend's
          `app/form_csrf.FORM_FIELD`. */}
      <input type="hidden" name="_csrf" value={page.viewer.formCsrf} />
      {/* Minted once per rendered form, in the loader: at submit time a
          double-click would mint two keys and record two entries. The field
          name is `idempotencyKey` — the hyphenated spelling is the HEADER
          alias, and a native form cannot send a header. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {cap === null ? null : (
        <p className="text-sm text-muted-foreground">
          Up to {cap} {cap === 1 ? 'event' : 'events'} per person.
        </p>
      )}

      {feeTiers.length === 0 ? null : (
        <p className="text-sm text-muted-foreground">
          Bundle pricing:{' '}
          {feeTiers
            .map(([count, cents]) => `${count} events — ${formatCents(cents)}`)
            .join('; ')}
          .
        </p>
      )}

      {PLAYER_BLOCKS.map((block) => (
        <PlayerBlock
          key={block.index}
          index={block.index}
          heading={block.heading}
          required={block.required}
          events={openEvents}
          askBirthYear={askBirthYear}
        />
      ))}

      <Separator />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acknowledged" value="on" required />
        <span>
          I have read and accept the regulations, and I understand each
          player&rsquo;s name will appear on this page&rsquo;s public entrant list.
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        The organiser confirms the total when they receive this entry — the
        prices above are per event.
      </p>

      <Button type="submit" className="justify-self-start">
        Submit entry
      </Button>
    </form>
  );
}
