/**
 * `/e/{slug}/enter` (+ `/enter/signed-in`, `/enter/created`), the entry
 * flow, on its own page off the hub scroll (SP-P6-2 §3, split approved as
 * G0).
 *
 * The mechanics are the SP-P6-1 entry page's, carried forward verbatim:
 *
 * - **The Idempotency-Key is minted here, in the loader**, once per rendered
 *   form, so a double-click's two POSTs carry the same key and the second is
 *   a replay against `UNIQUE (tournament_id, account_id, idempotency_key)`.
 *   It travels in the HTML, in the hidden field the backend reads, because a
 *   native form cannot send a header.
 * - **The `_csrf` token is minted here too, and NOT read from the projection**
 *   (R8-D): `viewer.formCsrf` is `''` on every server-rendered page, because
 *   node's projection fetch carries no cookie. `mintFormCsrf` mints the
 *   `sw_play_csrf` nonce on this response and the form carries its digest.
 * - **The form posts straight to FastAPI** (`/e/api/submit/{slug}`), plain
 *   `<form>`, never RR7's `<Form>`, node renders and never relays a
 *   credential. The one action here is not on a write path: it is where the
 *   quote route's 307 (and the add-player round trip) hand the entrant's own
 *   body back for re-rendering, so that body never travels as a query string.
 * - **The form renders unconditionally (R8-E).** This page cannot know who is
 *   reading it; who may submit is decided at the write, by
 *   `Depends(get_current_entrant)`, and an anonymous submit is navigated back
 *   here with the `NOT_SIGNED_IN` code.
 *
 * What is new is the §3 layout: a sectioned single page, Player(s) →
 * events per player → acknowledgment, with ONE player block by default and
 * "Add another player" as an explicit round trip (Z12, killing SP-P6-1's
 * permanently rendered second blank card), and the sticky total bar (Z14)
 * with the nearest deadline restated in it (refinement 3).
 */
import { Button, Notice, TextField } from '@scheduler/design-system/components';
import { data, isRouteErrorResponse, useRouteError } from 'react-router';

import { Breadcrumbs } from '../components/Breadcrumbs';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { StatusChip } from '../components/StatusChip';
import { StickyTotalBar } from '../components/StickyTotalBar';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import { narrowEvents, parseEcho, type FormEcho, type PlayerEcho } from '../lib/echo';
import type { EntryEventDTO, EntryPageDTO } from '../lib/entryPage.types';
import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { demoNowMs } from '../lib/demoClock.server';
import { hasEntrantSession } from '../lib/session.server';
import { VENUE_TIME_NOTE } from '../lib/tournamentFrame';
import { formatMoney } from '../lib/money';
import { capChipCountdown, formatDateRangeShort, formatDayMonthTimeInZone } from '../lib/format';
import { eventCodeLabel } from '../lib/draws.types';
import {
  chipState,
  nearestCloseAt,
  totalBarState,
  visibleBlocks,
} from '../lib/phase';
import type { Route } from './+types/enter';
import { BUTTON_SECONDARY, CARD, INLINE_METADATA_SEPARATOR, INPUT_SKIN, PAGE_TITLE } from '../lib/ui';
import { Chevron } from '../components/Chevron';

export interface EnterLoaderData {
  page: EntryPageDTO;
  idempotencyKey: string;
  /** The double-submit token for this rendered form, node's own, minted
   * together with the nonce set on this very response (R8-D). */
  formCsrf: string;
  /** The quote round trip / refusal echo, query-string half. Nothing in it
   * is trusted, see `parseEcho`. */
  echo: FormEcho;
  /** Which of this module's routes matched (E3). Not an identity claim and
   * not a capability: the URL is typeable, the banner grants nothing, and
   * the write is gated at the write. */
  justSignedIn: boolean;
  /** The `/created` variant, where `POST /e/account/signup`'s 303 lands when
   * the sign-up started from this tournament. Same argument as
   * `justSignedIn`: an outcome, not an identity. It says the ACCOUNT exists,
   * never that this reader is signed in. */
  justSignedUp: boolean;
  /** V3-PE16.2: cookie PRESENCE only (`hasEntrantSession`, same read
   * `PlayShell`'s header uses), never a credential relay (R8-D). Drives the
   * ONE state-aware account action in the page footer: a stranger sees
   * "Sign in" and nothing else; a signed-in device sees "Sign out" and
   * nothing else. Distinct from `justSignedIn`, which is a one-time outcome
   * carried by the URL, not a durable session read. */
  signedIn: boolean;
  /** SSR render instant, ms, `now` stays a parameter below the loader. */
  nowMs: number;
}

/** The suffixes of the other paths bound to this module (`app/routes.ts`). */
const SIGNED_IN_SUFFIX = '/signed-in';
const SIGNED_UP_SUFFIX = '/created';

/** The uniform 404, an unknown slug and a closed page answer identically,
 * constructed fresh so the causes stay byte-identical here too. */
function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { slug?: string };
}) {
  const slug = params.slug;
  if (!slug) throw notFound();

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  // One key, one rendered form, a plain value, never a getter (a getter
  // would mint two keys for a double-click's two reads). The nonce and its
  // token are minted in one call and returned together; `mintFormCsrf` takes
  // no arguments, so this route reads no credential of any kind.
  const csrf = mintFormCsrf();
  const url = new URL(request.url);
  const payload: EnterLoaderData = {
    page,
    idempotencyKey: crypto.randomUUID(),
    formCsrf: csrf.token,
    echo: parseEcho(url.searchParams),
    justSignedIn: url.pathname.endsWith(SIGNED_IN_SUFFIX),
    justSignedUp: url.pathname.endsWith(SIGNED_UP_SUFFIX),
    signedIn: hasEntrantSession(request),
    nowMs: demoNowMs(),
  };
  return data(payload, csrf.responseInit);
}

/**
 * Where the quote 307 and the add-player round trip land (Z12/Z13).
 *
 * `POST /e/api/quote/{slug}` answers a native form post with a **307** whose
 * `Location` is this route (G0), so the browser re-posts the SAME body here
 * and the query string carries only what the server computed. "Add another
 * player" posts the form to this route directly (its button carries
 * `formAction`), with `addPlayer=1` in the body. Either way: body first,
 * query second, through the SAME `parseEcho` the loader uses, one parser.
 *
 * It holds no credential and asks upstream for nothing (R8-D intact): the
 * request is read for its body and its query string, never a header, never
 * a cookie, and there is no `fetch` here. The structural guards run over
 * this file and would go red on any of that.
 */
export async function action({ request }: { request: Request }) {
  const posted = new URLSearchParams(await request.text());
  for (const [name, value] of new URL(request.url).searchParams) {
    if (name === 'reviewedQuote' || name === 'totalCents') posted.set(name, value);
    else posted.append(name, value);
  }
  return { echo: parseEcho(posted), addPlayer: posted.get('addPlayer') === '1',
    idempotencyKey: ((posted.get('idempotencyKey') ?? '').length <= 64 ? posted.get('idempotencyKey') ?? '' : '') };
}

/**
 * Forward the loader's headers onto the document, all of them, by
 * reference. React Router copies only `Set-Cookie` out of a loader's
 * `ResponseInit` unless the route exports `headers`, and this document
 * carries BOTH halves of a double-submit, so `Cache-Control: no-store`
 * must reach the wire. A pass-through, because the value belongs to the mint.
 */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

/**
 * Title + noindex. **`data.page` is the only read (I6)**, the meta guard in
 * `tests/tournament.meta.test.ts` pins the same allowlist shape for this
 * file. Both variants of this page are noindexed: the `/signed-in` variant
 * says "you are signed in" to a crawler that is not, and the plain form page
 * is a workflow surface whose canonical, linkable face is `/e/{slug}`.
 */
export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) {
    return [{ title: 'Entry page not found' }];
  }
  const name = data.page.tournament.name;
  return [
    { title: name ? `Enter · ${name}` : 'Enter' },
    { name: 'robots', content: 'noindex' },
  ];
};

/** The positional contract with `parse_players`: block N's inputs are read
 * at index N of every repeated field. Frozen: module scope in this SSR
 * process is shared by every concurrent entrant. */
const NO_ECHO: PlayerEcho = Object.freeze({
  name: '',
  gender: '',
  club: '',
  birthYear: '',
  remarks: '',
  events: [],
});

/** The reason `narrowEvents` withheld an event, in words. The projection's
 * own value is echoed for anything this build does not recognise, inventing
 * a rule the server did not state is the one thing this must not do. */
function constraintLabel(constraint: string | null): string {
  const folded = (constraint ?? '').trim().toLowerCase();
  if (folded === 'f') return 'female players';
  if (folded === 'm') return 'male players';
  if (folded === '') return 'another category of player';
  return `${constraint} players`;
}

const GENDERS = Object.freeze([
  ['', 'Select gender'],
  ['F', 'Female'],
  ['M', 'Male'],
] as const);

function PlayerBlock({
  index,
  events,
  askBirthYear,
  said,
  showAll,
  feeCurrency,
}: {
  index: number;
  events: EntryEventDTO[];
  askBirthYear: boolean;
  said: PlayerEcho;
  showAll: boolean;
  /** The organizer's stated currency, printed beside each fee when known. */
  feeCurrency: string | null | undefined;
}) {
  const prefix = `p${index}`;
  const offered = narrowEvents(events, said.gender, said.events, showAll);
  const ticked = new Set(said.events);
  // P6/A08: the events this player is NOT being offered, WITH the reason the
  // projection actually carries (`genderConstraint`). `narrowEvents` used to
  // drop them silently, so an entrant looking for an event that is not on the
  // list had nothing to read. No new rule is derived here, the same filter
  // decides both lists.
  const offeredIds = new Set(offered.map((event) => event.id));
  const withheld = events.filter((event) => !offeredIds.has(event.id));

  return (
    <section
      className={`grid gap-4 ${CARD}`}
      data-entry-player-block
    >
      <h3 className="text-base font-semibold text-foreground">
        {`Player ${index + 1}`}
        {index === 0 ? null : (
          <span className="ml-2 text-sm font-normal text-muted-foreground">optional</span>
        )}
      </h3>

      <fieldset className="grid gap-4 sm:grid-cols-2" data-entry-section="participant">
        <legend className="sr-only">Participant details</legend>
        <TextField
          id={`${prefix}name`}
          label="Full name"
          name="playerName"
          maxLength={200}
          required={index === 0}
          autoComplete="name"
          defaultValue={said.name}
        />
        <div>
          <label
            htmlFor={`${prefix}gender`}
            className="mb-2 block text-xs font-medium text-foreground"
          >
            Gender
          </label>
          {/* Native, not the design system's Radix Select, that one renders
              a button driven by onValueChange and cannot submit unhydrated. */}
          <select
            id={`${prefix}gender`}
            name="gender"
            required={index === 0}
            defaultValue={said.gender}
              className={`h-10 w-full rounded-sm px-3 ${INPUT_SKIN}`}
          >
            {GENDERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <TextField
          id={`${prefix}representation`}
          label="Representing (optional association code)"
          name="representation"
          maxLength={3}
          defaultValue={said.representation ?? ''}
          hint="For example TPE or KOR. Leave blank when unknown; this is not citizenship."
        />
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
            hint="This tournament runs age-bracketed events, so the organizer needs a year to place this player."
          />
        ) : (
          // Positional round-trip: the parser reads these lists by index, so
          // a block that omitted the input would shift every later player's
          // year onto the wrong person.
          <input type="hidden" name="birthYear" value="" />
        )}
      </fieldset>

      <fieldset className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-6" data-entry-section="events">
        <legend className="mb-1.5 text-sm font-medium text-foreground">Events</legend>
        {offered.map((event) => {
          const value = `${index}:${event.id}`;
          return (
            <label
              key={event.id}
              // 2026-08-11 design audit, finding #6: `py-0.5` put this row —
              // the product's single most important action, ticking an
              // event to enter it, at exactly the WCAG 2.2 AA 24px
              // target-size floor with zero margin. `py-1.5` clears it with
              // real room (~32px) for a mobile-heavy audience.
              className="flex flex-wrap items-center gap-2 rounded-sm px-1 py-1.5 text-sm text-foreground hover:bg-surface-sunken"
            >
              <input type="checkbox" name="events" value={value} defaultChecked={ticked.has(value)} className="h-4 w-4 accent-accent" />
              <span>
                {event.discipline} <span className="text-muted-foreground">({eventCodeLabel(event.code)})</span>
              </span>
              {event.feeCents === null ? null : (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {' '}{formatMoney(event.feeCents, feeCurrency)}
                </span>
              )}
            </label>
          );
        })}
        {/* E3: the partner field for every doubles event on offer.
            **Rendered whether or not the event is ticked in the SERVER's
            document**, because a scriptless reader who cannot be shown a
            field on tick must still be able to name a partner. `entry-
            wizard.js` reads `data-entry-partner-for` and shows only the
            boxes whose event is actually selected (P6/D6), so the enhanced
            page asks a singles entrant nothing about partners. Either way
            the server does the real filtering, `parse_partners` keeps only
            the addresses whose event this block actually selected, so a
            stale value in an unticked box nominates nobody.

            The field NAME carries the key (`partner:<block>:<event id>`) and
            the value is only the address. The events checkbox has to encode
            its key in its value, because a checkbox's value IS its payload;
            here there is a choice, and putting a user-typed string on the
            safe side of the split is the better one. */}
        {offered
          .filter((event) => event.entryType === 'doubles')
          .map((event) => (
            <div
              key={`partner-${event.id}`}
              className="sm:col-span-2"
              data-entry-section="partner"
              data-entry-partner-for={`${index}:${event.id}`}
            >
              <TextField
                id={`partner-${index}-${event.id}`}
                label={`Partner's email for ${eventCodeLabel(event.code)}`}
                name={`partner:${index}:${event.id}`}
                type="email"
                maxLength={320}
                defaultValue={said.partners?.[event.id] ?? ''}
                hint="We email them an invitation. Nothing is entered in their name until they accept; you can add a partner later."
              />
            </div>
          ))}
        {offered.length === 0 ? (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            No event is usually open to this player. Tick &ldquo;Show every event&rdquo;
            below, then update the total.
          </p>
        ) : null}
        {withheld.length === 0 ? null : (
          // D6: the reason an event is not on the list, where the data
          // exists. `genderConstraint` is the only reason `narrowEvents`
          // acts on, so it is the only one stated.
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Not listed for this player:{' '}
            {withheld
              .map(
                (event) =>
                  `${event.discipline} (${eventCodeLabel(event.code)}), open to ${constraintLabel(
                    event.genderConstraint,
                  )}`,
              )
              .join('; ')}
            . Tick &ldquo;Show every event&rdquo; below to enter one anyway.
          </p>
        )}
      </fieldset>

      <div data-entry-section="participant">
        <label
          htmlFor={`${prefix}remarks`}
          className="mb-2 block text-xs font-medium text-foreground"
        >
          Anything the organizer should know (optional)
        </label>
        <textarea
          id={`${prefix}remarks`}
          name="remarks"
          rows={2}
          maxLength={2000}
          placeholder="e.g. can't play before 6pm Saturday"
          defaultValue={said.remarks}
          className={`w-full resize-y rounded-sm p-2 ${INPUT_SKIN}`}
        />
      </div>
    </section>
  );
}

export default function Enter({ loaderData, actionData }: Route.ComponentProps) {
  const { page, idempotencyKey, formCsrf, justSignedIn, justSignedUp, signedIn, nowMs } = loaderData;
  // The re-posted body wins when there is one: on the 307 landing the loader
  // sees only the query string, and the entrant's own typing arrives in the
  // POST the action read. Same parser both times.
  const echo = actionData?.echo ?? loaderData.echo;
  const blocks = visibleBlocks(echo, actionData?.addPlayer ?? false);
  const bar = totalBarState(echo);
  const now = new Date(nowMs);
  const deadline = nearestCloseAt(page.events);
  // V3-26-5: cap the relative countdown at an absolute date past the
  // threshold, StatusChip and StickyTotalBar both read this same `chip`.
  const chip = capChipCountdown(chipState(page.events, now), deadline, page.tournament.timeZone);
  const slug = page.page.slug;
  // Whichever variant is rendering, the add-player round trip lands back on
  // it, a plain `/enter` would drop the outcome the URL states.
  const variant = justSignedIn ? SIGNED_IN_SUFFIX : justSignedUp ? SIGNED_UP_SUFFIX : '';
  const selfPath = `/e/${encodeURIComponent(slug)}/enter${variant}`;
  const openEvents = page.events.filter((event) => event.isOpen);
  const askBirthYear = openEvents.some((event) => event.ageBracketed);
  const cap = page.policy.maxEventsPerPerson;
  // Display only, both lines: the director's own configuration, stated
  // BEFORE submission (R14 §4) because the refusal copy cannot name which
  // rule broke. A non-integer cap is skipped exactly as `_discipline_breach`
  // skips it, so this cannot promise a limit the server would not enforce.
  const feeTiers = Object.entries(page.page.feeSchedule).sort(([a], [b]) => Number(a) - Number(b));
  const disciplineCaps = Object.entries<unknown>(page.policy.disciplineCaps ?? {}).filter(
    (entry): entry is [string, number] => Number.isInteger(entry[1]),
  );
  // The director's own limits as one sentence for the total bar, or null
  // when there are none — never an empty line.
  const capsLine =
    cap === null && disciplineCaps.length === 0
      ? null
      : `${cap === null ? '' : `Up to ${cap} ${cap === 1 ? 'event' : 'events'} per person. `}${
          disciplineCaps.length === 0
            ? ''
            : `Per discipline: ${disciplineCaps
                .map(([discipline, limit]) => `${limit} ${discipline} ${limit === 1 ? 'event' : 'events'}`)
                .join('; ')} per person.`
        }`.trim();
  const timeZone = page.tournament.timeZone ?? 'UTC';
  // ONE compact meta line under the title (public refinement 2026-09-12):
  // the day, the nearest closing moment stated to the minute in the venue
  // zone, and how many events are open. It replaces the three-cell context
  // card that used to sit between the title and the form.
  const deadlineText = deadline ? formatDayMonthTimeInZone(deadline, timeZone) : null;
  const metaParts = [
    formatDateRangeShort(page.tournament.date, page.tournament.endDate) || null,
    deadlineText ? `Entries close ${deadlineText}` : null,
    `${openEvents.length} of ${page.events.length} ${page.events.length === 1 ? 'event' : 'events'} open`,
  ].filter((part): part is string => Boolean(part));

  return (
    <PlayShell>
      <section className="border-b border-rule-soft bg-surface-raised">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 md:py-5">
          {/* P7: the entry form is the last tournament-scoped page that still
              carried its own floating back arrow. It now speaks the frame's
              grammar, the same breadcrumb trail, the same ancestors, the
              current page as plain text, even though the wizard keeps its
              own header band rather than the tournament frame. */}
          <Breadcrumbs
            crumbs={[
              { label: 'Tournaments', href: '/e/' },
              { label: page.tournament.name ?? 'Tournament', href: `/e/${encodeURIComponent(slug)}` },
              { label: 'Enter', href: null },
            ]}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className={PAGE_TITLE}>
              {openEvents.length > 0 ? 'Enter this tournament' : 'Entries are closed'}
            </h1>
            {openEvents.length > 0 ? <StatusChip state={chip} /> : null}
          </div>
          {openEvents.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {metaParts.join(INLINE_METADATA_SEPARATOR)}
              {/* Contract §7.1 / P7: the venue-time rule, stated ONCE on this
                  page, exactly as the tournament frame states it. Having said
                  it, the deadline carries no offset and no zone identifier. */}
              {INLINE_METADATA_SEPARATOR}
              <span className="text-xs">{VENUE_TIME_NOTE}</span>
            </p>
          ) : null}
        </div>
      </section>

      {/* A08 fix, half two: `data-entry-page` scopes the one CSS rule that
          makes `hidden` real on this page (`app.css`, P6). Tailwind display
          utilities live in the utilities layer and outrank the base
          `[hidden]` rule, so every `hidden` panel here, each of which also
          carries `grid` or `flex`, rendered anyway. */}
      <main data-entry-page className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
        {openEvents.length > 0 ? (
          <>
        {/* D6: TWO stages, and nothing called "Submitted", the completion
            state is the backend-issued receipt this form posts to, not a
            numbered step nobody can navigate to. The indicator is `hidden`
            in the server-rendered document on purpose (A08): a scriptless
            reader gets ONE continuous form, details, review, submit, and
            wizard-only navigation would describe a journey their browser
            cannot take. `entry-wizard.js` unhides it when it takes over. */}
        <nav hidden data-entry-stage-nav aria-label="Entry progress" className="mb-4">
          <ol className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
            {[
              ['details', 'Entry details'],
              ['review', 'Review'],
            ].map(([key, label], index) => (
              <li key={key} data-entry-stage-item={key} className="flex items-center gap-2">
                <span className="inline-flex min-h-8 items-center gap-2 py-1.5">
                  <span
                    data-entry-stage-number
                    className="grid h-6 w-6 place-items-center rounded-xs border border-rule-control tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span>{label}</span>
                </span>
                {index === 0 ? <Chevron className="text-muted-foreground" /> : null}
              </li>
            ))}
          </ol>
        </nav>

        {/* Z15, the shipped R8-E posture: this page cannot know who is
            reading it, so it states what the write will require instead of
            guessing, with the sign-in handoff and a `next` return to THIS
            route's confirming variant.

            D6: authentication is a PREREQUISITE, not a numbered stage. A
            signed-in device is told so in one quiet line and asked for
            nothing; a signed-out one gets exactly ONE sign-in action (the
            page footer's duplicate link is gone). Either way the draft is
            preserved by `entry-wizard.js`'s same-tab session draft and the
            `next` targets below, which return to THIS form. */}
        <section data-entry-account className="mb-5">
          {justSignedIn ? (
            <Notice tone="success">
              You are signed in. Fill in the form below and press
              &ldquo;Submit entry&rdquo;.
            </Notice>
          ) : signedIn ? (
            <p className="text-sm text-muted-foreground">
              You are signed in on this device. Your entry is recorded when you press
              &ldquo;Submit entry&rdquo;.
            </p>
          ) : (
            <Notice tone={justSignedUp ? 'success' : 'info'}>
            {/* E3: the sign-up outcome, stated on the page the entrant
                started from. Landing back on the plain form after creating an
                account said nothing at all, which is indistinguishable from a
                form that had quietly failed. The copy is true on BOTH of the
                backend's branches, a new account is ready, and one that
                already existed is ready too, so it is not the enumeration
                oracle the uniform 303 exists to avoid, and it claims no
                session: this tier cannot read one.

                Public refinement 2026-09-12: one line, with the sign-in
                action inline, so the form fields start higher on a phone. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>
                {justSignedUp
                  ? 'Your entrant account is ready. Sign in to submit this entry.'
                  : 'Submitting needs an entrant account. Your answers are kept on this device while you sign in.'}
              </span>
              <a
                href={`/e/login?next=/e/${encodeURIComponent(slug)}/enter/signed-in`}
                className="inline-flex h-11 items-center justify-center rounded border border-action-primary-hover bg-accent px-3.5 text-sm font-semibold text-accent-ink shadow hover:bg-action-primary-hover"
              >
                Sign in to continue
              </a>
              {justSignedUp ? null : (
                <span className="text-sm text-muted-foreground">
                  or{' '}
                  {/* The slug rides in the PATH, so this hop keeps the
                      tournament the entrant is half-way through entering.
                      `signup.tsx` composes the return URL from it, under the
                      same allowlist the sign-in link's `next` goes through. */}
                  <a
                    href={`/e/signup?next=${encodeURIComponent(`/e/${slug}/enter/created`)}`}
                    className="underline underline-offset-4"
                  >
                    create one
                  </a>
                </span>
              )}
            </div>
            </Notice>
          )}
        </section>

          </>
        ) : null}

        {openEvents.length === 0 ? (
          // V3-PE16.1: one heading (the page's own "Entries are closed",
          // above), one paragraph naming this tournament, no repetition, and
          // no reopening promise, `EntryPageDTO` carries no published
          // entry-window field to point to, so none is claimed. See
          // `docs/reference/debt-log.md` for the field this would need.
          <section className="mt-6 grid justify-items-start gap-3 rounded-lg border border-rule-soft bg-surface-raised p-5" data-entry-closed>
            <p className="max-w-prose text-sm text-muted-foreground">
              {`Entries are closed for ${page.tournament.name ?? 'this tournament'}. `}
              View the tournament page for schedules and results.
            </p>
            <a
              href={`/e/${encodeURIComponent(slug)}`}
              className={BUTTON_SECONDARY}
            >
              View tournament information
            </a>
          </section>
        ) : (
          <form
            id="enter"
            data-entry-wizard
            data-entry-initial-stage={echo.reviewedQuote && !echo.refusal ? 'review' : 'details'}
            method="post"
            action={`/e/api/submit/${slug}`}
            encType="application/x-www-form-urlencoded"
            className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8"
          >
            {/* E5: `pb-24` is clearance for the sticky bar, which hovers
                OVER this column while the page scrolls, the acknowledgment
                checkbox, the last thing to read before submitting, was
                underneath it. Padding on the scrolling content is the native
                answer; from `lg:` up the bar is a side rail and there is
                nothing to clear. */}
            <div className="grid gap-6 pb-24 lg:pb-0">
              {/* Channel two: the double-submit token, the loader's mint,
                  never `viewer.formCsrf`. The NAME comes from `FORM_FIELD`,
                  so the cross-tier pin on it stays load-bearing. */}
              <input type="hidden" name={FORM_FIELD} value={formCsrf} />
              {/* Minted once per rendered form, in the loader; the field name
                  is the backend's `idempotencyKey` (the hyphenated spelling
                  is the header alias a native form cannot send). */}
              <input type="hidden" name="idempotencyKey" value={actionData?.idempotencyKey || idempotencyKey} />
              <input type="hidden" name="reviewedQuote" value={echo.reviewedQuote ?? ''} />

              {/* STAGE 1, Entry details. One container, so the enhanced
                  page switches stages by hiding exactly one element rather
                  than by juggling seven panels' worth of `hidden`. Without
                  script it is simply the top of a single, complete form. */}
              <div data-entry-stage="details" id="entry-details" className="grid gap-6">
                <h2 className="text-lg font-semibold">Entry details</h2>
                {Array.from({ length: blocks }, (_, index) => (
                  <PlayerBlock
                    key={index}
                    index={index}
                    events={openEvents}
                    askBirthYear={askBirthYear}
                    said={echo.players[index] ?? NO_ECHO}
                    showAll={echo.showAllEvents}
                    feeCurrency={page.page.feeCurrency}
                  />
                ))}

                <div data-entry-section="events">
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="showAllEvents"
                      value="on"
                      defaultChecked={echo.showAllEvents}
                      className="mt-0.5 h-4 w-4 accent-accent"
                    />
                    <span>
                      Show every event, including ones not usually open to a player. A
                      mismatch is accepted, the organizer sees a flag and decides.
                    </span>
                  </label>
                </div>

                {/* Z12: an explicit action, not a permanently rendered blank
                    card. `formAction` aims at THIS route's own action, a
                    render round trip, no backend call, works signed-out, and
                    the parser drops an untouched block at submit time. D6
                    keeps it: an account may legitimately enter more than the
                    one person it belongs to. */}
                <Button
                  type="submit"
                  name="addPlayer"
                  value="1"
                  variant="outline"
                  formAction={selfPath}
                  formNoValidate
                  className="justify-self-start"
                >
                  Add another player
                </Button>

                {/* The ONE forward action of stage 1, and the only wizard
                    control on the page. `hidden` in the server document
                    because a scriptless reader is already looking at the
                    review section below it. */}
                <div hidden data-entry-wizard-controls="details" className="flex flex-wrap gap-2">
                  <button type="button" data-wizard-next="details" className="inline-flex h-11 items-center justify-center rounded border border-action-primary-hover bg-accent px-3.5 text-sm font-semibold text-accent-ink shadow hover:bg-action-primary-hover">Review entry</button>
                </div>
              </div>

              {/* STAGE 2, Review. Server-rendered VISIBLE: with no script
                  this is the end of one coherent form, and the submit in the
                  bar posts it. */}
              <section data-entry-stage="review" id="entry-review" className={`grid gap-3 ${CARD}`}>
                <h2 className="text-base font-semibold text-foreground">Review and submit</h2>
                <div data-entry-review-summary className="grid gap-2 text-sm text-muted-foreground">
                  <p>Check each player, their events and any partner you named, then accept the regulations and submit.</p>
                </div>
                {/* D6: the pending conditions, stated explicitly rather than
                    left for the receipt to reveal. Each one is a fact this
                    page already knows. */}
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  <li>Your total is the organizer&rsquo;s quote and is confirmed on the receipt this submission issues.</li>
                  <li>A partner is entered only once they accept the invitation emailed to the address you gave.</li>
                  <li>Payment, where the organizer requires it, follows their instructions after submission.</li>
                  {echo.showAllEvents ? (
                    <li>An event outside a player&rsquo;s usual category is accepted, flagged, and decided by the organizer.</li>
                  ) : null}
                </ul>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" name="acknowledged" value="on" required />
                  <span>
                    I have read and accept the regulations, and I understand each
                    player&rsquo;s name, club and supplied representation will appear on this page&rsquo;s
                    public entrant list once the organizer publishes it.
                  </span>
                </label>
                {/* The ONE back/edit action of stage 2. Hidden without
                    script, where there is nothing to go back to. */}
                <div hidden data-entry-wizard-controls="review" className="flex flex-wrap gap-2">
                  <button type="button" data-wizard-back="review" className={BUTTON_SECONDARY}>Back to entry details</button>
                </div>
              </section>
            </div>

            {/* Z14 + refinement 3. Its "Update total" submit carries the
                quote formAction; `?signedIn=1` is TRANSPORT on the quote URL
                (presence only, the backend appends its own suffix), so the
                write post never carries it. */}
            <div data-entry-submit-bar>
              <StickyTotalBar
                state={bar}
                chip={chip}
                deadline={deadline}
                timeZone={timeZone}
                feeCurrency={page.page.feeCurrency}
                feeTiers={feeTiers}
                capsLine={capsLine}
                quoteAction={`/e/api/quote/${slug}${justSignedIn ? '?signedIn=1' : ''}`}
              />
            </div>
          </form>
        )}

        {/* V3-PE16.2: ONE state-aware account action, derived from the real
            session (cookie PRESENCE, `hasEntrantSession`, the same read
            `PlayShell`'s header uses; never a credential relay, R8-D). A
            stranger sees "Sign in" and nothing about signing out; a signed-in
            device sees "Sign out" and nothing asking it to diagnose its own
            auth state. The enter page is where the sign-out form lives (not a
            standalone page) because it already mints the nonce this form
            needs, a standalone page would mint a second nonce at Path=/ and
            last-issuance-wins would invalidate a half-filled form in another
            tab. A POST, never a link: a GET that signed out would be
            CSRF-able by any prefetch. */}
        <footer className="mt-10 border-t border-rule-soft pt-4 text-sm">
          {signedIn ? (
            <form method="post" action="/e/account/logout" className="flex flex-wrap items-baseline gap-3">
              <input type="hidden" name={FORM_FIELD} value={formCsrf} />
              {/* Never omitted: `logout`'s own fallback is `/e/account/login`,
                  which is POST-only, a 405 after a successful sign-out. */}
              <input type="hidden" name="next" value={`/e/${encodeURIComponent(slug)}`} />
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
              <span className="text-muted-foreground">
                Signs out this device only. Entries you have already submitted
                are unaffected.
              </span>
            </form>
          ) : (
            // V3-PE16.2's state-aware account slot, kept: this is the pair
            // of "Sign out" above, not a second primary. The ONE prominent
            // "Sign in to continue" action for the entry itself is at the
            // top of the page, where the requirement is stated (D6).
            <p className="text-muted-foreground">
              <a
                href={`/e/login?next=/e/${encodeURIComponent(slug)}/enter/signed-in`}
                className="underline underline-offset-4"
              >
                Sign in
              </a>
            </p>
          )}
        </footer>
        <script type="module" src="/e/assets/entry-wizard.js" />
      </main>
    </PlayShell>
  );
}

/** Reads the status and nothing else, no upstream prose or topology on a
 * public page. Same copy as the tournament page's boundary. */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="This entry page is not available"
        body="Check the link, or ask the organizer for the current one."
      />
    );
  }

  return (
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}
