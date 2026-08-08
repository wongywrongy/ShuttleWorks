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
 * **Two submit controls, two actions (R14).** "Submit entry" posts to
 * `/e/api/submit/{slug}` and records. "Update events and total" carries
 * `formAction` to `/e/api/quote/{slug}` with `action=filter` — the incumbent's
 * mechanism (`api/entries_public.py:589`) repointed at a route that writes
 * nothing — and `formNoValidate`, because pressing it is not a claim that the
 * form is finished. That is a real navigation in every browser: this is a
 * plain `<form>`, not React Router's `<Form>`, so RR7 never intercepts the
 * submission and a hydrated browser posts the document exactly as a scriptless
 * one does. The quote route answers a browser `Accept` with a 303 back to this
 * page carrying the posted body plus the server's total, and this loader
 * renders it. **There is deliberately no fetch-and-navigate enhancement**: a
 * second client path for the same act is a second thing that can drift from
 * `compute_fee_total`, which is the drift R14 exists to prevent. The cost is a
 * document reload; the price of the alternative is a wrong number about money.
 *
 * **Gender is a native `<select>`, not the design system's `Select`.** That
 * component wraps Radix, which renders a `<button>` driven by `onValueChange`
 * — nothing submits without hydration. `TextField` is used as-is: it spreads
 * `...inputProps` onto a real `<input>`, so `name`, `required` and
 * `defaultValue` reach the DOM.
 *
 * **No fee is computed here** (R14). Per-event prices and the bundle schedule
 * are cents from the projection, formatted; the total is the server's, from
 * the same `compute_fee_total` the write uses, and it is displayed but never
 * posted back.
 */
import {
  Button,
  Card,
  CardContent,
  Notice,
  Separator,
  TextField,
} from '@scheduler/design-system/components';

import { narrowEvents, type FormEcho, type PlayerEcho } from '../lib/echo';
import { FORM_FIELD } from '../lib/formField';
import { formatCents } from '../lib/money';
import type { EntryEventDTO, EntryPageDTO } from '../lib/entryPage.types';

export interface EntryFormProps {
  page: EntryPageDTO;
  idempotencyKey: string;
  /** The loader-minted double-submit token (R8-D). NOT `page.viewer.formCsrf`
   * — that is `""` on every SSR page, because node's projection fetch carries
   * no cookie for `_optional_entrant` to read. */
  formCsrf: string;
  echo: FormEcho;
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

/** A block nobody has typed into yet. Frozen for the reason above. */
const NO_ECHO: PlayerEcho = Object.freeze({
  name: '',
  gender: '',
  club: '',
  birthYear: '',
  remarks: '',
  events: [],
});

function PlayerBlock({
  index,
  heading,
  required,
  events,
  askBirthYear,
  said,
  showAll,
}: {
  index: number;
  heading: string;
  required: boolean;
  events: EntryEventDTO[];
  askBirthYear: boolean;
  said: PlayerEcho;
  showAll: boolean;
}) {
  const prefix = `p${index}`;
  const offered = narrowEvents(events, said.gender, said.events, showAll);
  const ticked = new Set(said.events);

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
          defaultValue={said.name}
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
            defaultValue={said.gender}
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
          defaultValue={said.club}
        />

        {askBirthYear ? (
          <TextField
            id={`${prefix}year`}
            label="Birth year"
            name="birthYear"
            inputMode="numeric"
            maxLength={4}
            defaultValue={said.birthYear}
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
            defaultValue={said.remarks}
            className="w-full rounded-sm border border-rule-control bg-bg-elev p-2 text-sm text-foreground"
          />
        </div>

        <fieldset className="grid gap-1">
          <legend className="mb-1 text-xs font-medium text-foreground">Events</legend>
          {offered.map((event) => {
            const value = `${index}:${event.id}`;
            return (
              <label
                key={event.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="events"
                  value={value}
                  defaultChecked={ticked.has(value)}
                />
                <span>
                  {event.discipline} ({event.code})
                </span>
                {event.feeCents === null ? null : (
                  <span className="text-xs text-muted-foreground">
                    {formatCents(event.feeCents)}
                  </span>
                )}
              </label>
            );
          })}
          {offered.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No event is usually open to this player. Tick &ldquo;Show every
              event&rdquo; below, then press &ldquo;Update events and
              total&rdquo;.
            </p>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}

export function EntryForm({ page, idempotencyKey, formCsrf, echo }: EntryFormProps) {
  const openEvents = page.events.filter((event) => event.isOpen);
  const askBirthYear = openEvents.some((event) => event.ageBracketed);
  const cap = page.policy.maxEventsPerPerson;
  // Display only: the server-supplied bundle schedule, formatted verbatim.
  // No arithmetic — `compute_fee_total` decides what a multi-event entrant
  // actually pays, and R14 requires stating that rule before submission.
  const feeTiers = Object.entries(page.page.feeSchedule).sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  // Display only, same contract as the tiers above: the director's own
  // per-discipline caps, stated before submission because `DISCIPLINE_CAP`
  // refusal copy cannot name which cap broke (`lib/echo.ts`). A non-integer
  // value is skipped exactly as `_discipline_breach` skips it
  // (`services/entry_policy.py`), so this cannot promise a limit the server
  // would not enforce.
  const disciplineCaps = Object.entries(page.policy.disciplineCaps ?? {}).filter(
    (entry): entry is [string, number] => Number.isInteger(entry[1]),
  );

  return (
    <form
      method="post"
      action={`/e/api/submit/${page.page.slug}`}
      encType="application/x-www-form-urlencoded"
      className="grid gap-4"
    >
      {/* Channel two: the double-submit token, so an unhydrated form still
          proves a same-origin browser sent this. Minted in the loader
          alongside the `sw_play_csrf` nonce set on this very response (R8-D)
          — NOT `page.viewer.formCsrf`, which is `""` on every SSR page
          because node's projection fetch carries no cookie. `_csrf` is the
          backend's `app/form_csrf.FORM_FIELD`, and this digest is
          `app/lib/formCsrf.server.ts`'s, pinned byte-for-byte against the
          Python one by a cross-tier test. The NAME comes from that module's
          `FORM_FIELD` rather than from a literal here, so the cross-tier pin
          on it is load-bearing: change the constant and this input's name
          changes with it, instead of the two drifting apart while the test
          stays green. */}
      <input type="hidden" name={FORM_FIELD} value={formCsrf} />
      {/* Minted once per rendered form, in the loader: at submit time a
          double-click would mint two keys and record two entries. The field
          name is `idempotencyKey` — the hyphenated spelling is the HEADER
          alias, and a native form cannot send a header. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {echo.refusal ? <Notice tone="warning">{echo.refusal}</Notice> : null}

      {cap === null ? null : (
        <p className="text-sm text-muted-foreground">
          Up to {cap} {cap === 1 ? 'event' : 'events'} per person.
        </p>
      )}

      {disciplineCaps.length === 0 ? null : (
        <p className="text-sm text-muted-foreground">
          Per discipline:{' '}
          {disciplineCaps
            .map(
              ([discipline, limit]) =>
                `${limit} ${discipline} ${limit === 1 ? 'event' : 'events'}`,
            )
            .join('; ')}{' '}
          per person.
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
          said={echo.players[block.index] ?? NO_ECHO}
          showAll={echo.showAllEvents}
        />
      ))}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="showAllEvents"
          value="on"
          defaultChecked={echo.showAllEvents}
        />
        <span>
          Show every event, including ones not usually open to a player. A
          mismatch is accepted &mdash; the organiser sees a flag and decides.
        </span>
      </label>

      <Button
        type="submit"
        variant="outline"
        name="action"
        value="filter"
        formAction={`/e/api/quote/${page.page.slug}`}
        formNoValidate
        className="justify-self-start"
      >
        Update events and total
      </Button>

      {/* The total is the server's. Shown, never posted: the write path
          recomputes it (`api/entries_json.py:610`), so an edited query string
          reaches no record. It is NOT harmless, though — this URL is a GET,
          which means it is shareable, and a link is read by whoever was sent
          it, not by whoever wrote it. `readCents` bounds this one to a
          non-negative integer, and the refusal beside it is a server code
          mapped to fixed copy for the same reason. */}
      {echo.totalCents === null ? (
        <p className="text-sm text-muted-foreground">
          The organiser confirms the total when they receive this entry &mdash;
          the prices above are per event. Press &ldquo;Update events and
          total&rdquo; to see what this basket comes to.
        </p>
      ) : (
        <p className="text-sm">
          Provisional total <strong>{formatCents(echo.totalCents)}</strong>{' '}
          &mdash; confirmed on your receipt.
        </p>
      )}

      <Separator />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acknowledged" value="on" required />
        <span>
          I have read and accept the regulations, and I understand each
          player&rsquo;s name will appear on this page&rsquo;s public entrant list.
        </span>
      </label>

      {/* Stated before submission, in the same grammar as the caps and the
          bundle schedule above (R14 §4). The page CANNOT know whether this
          reader is signed in — node's projection fetch is always anonymous
          (R8-D) — so the requirement is stated to everyone rather than
          guessed at for anyone. An entrant who is not signed in is navigated
          back to this page with the `NOT_SIGNED_IN` notice rather than shown
          a raw 401 (`entrant_or_back_to_form`, `api/entries_json.py`). */}
      <p className="text-sm text-muted-foreground">
        Submitting needs an entrant account. If you are not signed in, this
        page will say so and nothing is recorded.
      </p>

      <Button type="submit" className="justify-self-start">
        Submit entry
      </Button>
    </form>
  );
}
