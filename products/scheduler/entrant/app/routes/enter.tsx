/**
 * `/e/{slug}/enter` (+ `/enter/signed-in`) — the entry flow, on its own page
 * off the hub scroll (SP-P6-2 §3, split approved as G0).
 *
 * The mechanics are the SP-P6-1 entry page's, carried forward verbatim:
 *
 * - **The Idempotency-Key is minted here, in the loader** — once per rendered
 *   form, so a double-click's two POSTs carry the same key and the second is
 *   a replay against `UNIQUE (tournament_id, account_id, idempotency_key)`.
 *   It travels in the HTML, in the hidden field the backend reads, because a
 *   native form cannot send a header.
 * - **The `_csrf` token is minted here too, and NOT read from the projection**
 *   (R8-D): `viewer.formCsrf` is `''` on every server-rendered page, because
 *   node's projection fetch carries no cookie. `mintFormCsrf` mints the
 *   `sw_play_csrf` nonce on this response and the form carries its digest.
 * - **The form posts straight to FastAPI** (`/e/api/submit/{slug}`), plain
 *   `<form>`, never RR7's `<Form>` — node renders and never relays a
 *   credential. The one action here is not on a write path: it is where the
 *   quote route's 307 (and the add-player round trip) hand the entrant's own
 *   body back for re-rendering, so that body never travels as a query string.
 * - **The form renders unconditionally (R8-E).** This page cannot know who is
 *   reading it; who may submit is decided at the write, by
 *   `Depends(get_current_entrant)`, and an anonymous submit is navigated back
 *   here with the `NOT_SIGNED_IN` code.
 *
 * What is new is the §3 layout: a sectioned single page — Player(s) →
 * events per player → acknowledgment — with ONE player block by default and
 * "Add another player" as an explicit round trip (Z12, killing SP-P6-1's
 * permanently rendered second blank card), and the sticky total bar (Z14)
 * with the nearest deadline restated in it (refinement 3).
 */
import { Button, Notice, TextField } from '@scheduler/design-system/components';
import { data, isRouteErrorResponse, useRouteError } from 'react-router';

import { PlayShell } from '../components/PlayShell';
import { StatusChip } from '../components/StatusChip';
import { StickyTotalBar } from '../components/StickyTotalBar';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import { narrowEvents, parseEcho, type FormEcho, type PlayerEcho } from '../lib/echo';
import type { EntryEventDTO, EntryPageDTO } from '../lib/entryPage.types';
import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { formatCents } from '../lib/money';
import {
  chipState,
  toDiscoveryCard,
  totalBarState,
  visibleBlocks,
} from '../lib/phase';
import type { Route } from './+types/enter';

export interface EnterLoaderData {
  page: EntryPageDTO;
  idempotencyKey: string;
  /** The double-submit token for this rendered form — node's own, minted
   * together with the nonce set on this very response (R8-D). */
  formCsrf: string;
  /** The quote round trip / refusal echo, query-string half. Nothing in it
   * is trusted — see `parseEcho`. */
  echo: FormEcho;
  /** Which of this module's two routes matched (E3). Not an identity claim
   * and not a capability: the URL is typeable, the banner grants nothing,
   * and the write is gated at the write. */
  justSignedIn: boolean;
  /** SSR render instant, ms — `now` stays a parameter below the loader. */
  nowMs: number;
}

/** The suffix of the second path bound to this module (`app/routes.ts`). */
const SIGNED_IN_SUFFIX = '/signed-in';

/** The uniform 404 — an unknown slug and a closed page answer identically,
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

  // One key, one rendered form — a plain value, never a getter (a getter
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
    nowMs: Date.now(),
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
 * query second, through the SAME `parseEcho` the loader uses — one parser.
 *
 * It holds no credential and asks upstream for nothing (R8-D intact): the
 * request is read for its body and its query string — never a header, never
 * a cookie, and there is no `fetch` here. The structural guards run over
 * this file and would go red on any of that.
 */
export async function action({ request }: { request: Request }) {
  const posted = new URLSearchParams(await request.text());
  for (const [name, value] of new URL(request.url).searchParams) {
    posted.append(name, value);
  }
  return { echo: parseEcho(posted), addPlayer: posted.get('addPlayer') === '1' };
}

/**
 * Forward the loader's headers onto the document — all of them, by
 * reference. React Router copies only `Set-Cookie` out of a loader's
 * `ResponseInit` unless the route exports `headers`, and this document
 * carries BOTH halves of a double-submit, so `Cache-Control: no-store`
 * must reach the wire. A pass-through, because the value belongs to the mint.
 */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

/**
 * Title + noindex. **`data.page` is the only read (I6)** — the meta guard in
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
    { title: name ? `Enter — ${name}` : 'Enter' },
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

const GENDERS = Object.freeze([
  ['', '—'],
  ['F', 'Female'],
  ['M', 'Male'],
] as const);

function PlayerBlock({
  index,
  events,
  askBirthYear,
  said,
  showAll,
}: {
  index: number;
  events: EntryEventDTO[];
  askBirthYear: boolean;
  said: PlayerEcho;
  showAll: boolean;
}) {
  const prefix = `p${index}`;
  const offered = narrowEvents(events, said.gender, said.events, showAll);
  const ticked = new Set(said.events);

  return (
    <section className="grid gap-4 rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">
        {`Player ${index + 1}`}
        {index === 0 ? null : (
          <span className="ml-2 text-sm font-normal text-muted-foreground">optional</span>
        )}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
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
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Gender
          </label>
          {/* Native, not the design system's Radix Select — that one renders
              a button driven by onValueChange and cannot submit unhydrated. */}
          <select
            id={`${prefix}gender`}
            name="gender"
            required={index === 0}
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
          // Positional round-trip: the parser reads these lists by index, so
          // a block that omitted the input would shift every later player's
          // year onto the wrong person.
          <input type="hidden" name="birthYear" value="" />
        )}
      </div>

      <fieldset className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-6">
        <legend className="mb-1.5 text-sm font-medium text-foreground">Events</legend>
        {offered.map((event) => {
          const value = `${index}:${event.id}`;
          return (
            <label
              key={event.id}
              className="flex flex-wrap items-center gap-2 rounded px-1 py-0.5 text-sm text-foreground"
            >
              <input type="checkbox" name="events" value={value} defaultChecked={ticked.has(value)} />
              <span>
                {event.discipline} <span className="text-muted-foreground">({event.code})</span>
              </span>
              {event.feeCents === null ? null : (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatCents(event.feeCents)}
                </span>
              )}
            </label>
          );
        })}
        {offered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No event is usually open to this player. Tick &ldquo;Show every event&rdquo;
            below, then update the total.
          </p>
        ) : null}
      </fieldset>

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
    </section>
  );
}

export default function Enter({ loaderData, actionData }: Route.ComponentProps) {
  const { page, idempotencyKey, formCsrf, justSignedIn, nowMs } = loaderData;
  // The re-posted body wins when there is one: on the 307 landing the loader
  // sees only the query string, and the entrant's own typing arrives in the
  // POST the action read. Same parser both times.
  const echo = actionData?.echo ?? loaderData.echo;
  const blocks = visibleBlocks(echo, actionData?.addPlayer ?? false);
  const bar = totalBarState(echo);
  const now = new Date(nowMs);
  const chip = chipState(page.events, now);
  const deadline = toDiscoveryCard(page).entriesCloseAt;
  const slug = page.page.slug;
  const selfPath = `/e/${encodeURIComponent(slug)}/enter${justSignedIn ? SIGNED_IN_SUFFIX : ''}`;
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

  return (
    <PlayShell>
      <section className="border-b border-rule-soft bg-surface-raised">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
          <p className="text-sm">
            <a
              href={`/e/${encodeURIComponent(slug)}`}
              className="text-accent underline-offset-4 hover:underline"
            >
              ← {page.tournament.name ?? 'Tournament page'}
            </a>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Enter this tournament
            </h1>
            <StatusChip state={chip} />
          </div>
          {cap !== null || feeTiers.length > 0 ? (
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {cap === null ? '' : `Up to ${cap} ${cap === 1 ? 'event' : 'events'} per person. `}
              {feeTiers.length === 0
                ? ''
                : `Bundle pricing per player: ${feeTiers
                    .map(
                      ([count, cents]) =>
                        `${count} ${count === '1' ? 'event' : 'events'} — ${formatCents(cents)}`,
                    )
                    .join('; ')}.`}
            </p>
          ) : null}
          {disciplineCaps.length === 0 ? null : (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
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
        </div>
      </section>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
        {/* Z15 — the shipped R8-E posture: this page cannot know who is
            reading it, so it states what the write will require instead of
            guessing, with the sign-in handoff and a `next` return to THIS
            route's confirming variant. */}
        {justSignedIn ? (
          <Notice tone="success">
            You are signed in. Fill in the form below and press
            &ldquo;Submit entry&rdquo;.
          </Notice>
        ) : (
          <Notice tone="info">
            Submitting needs an entrant account.{' '}
            <a
              href={`/e/login?next=/e/${encodeURIComponent(slug)}/enter/signed-in`}
              className="underline underline-offset-4"
            >
              Sign in
            </a>{' '}
            or{' '}
            <a href="/e/signup" className="underline underline-offset-4">
              create one
            </a>{' '}
            — you&rsquo;ll come straight back here. Until you are signed in, nothing
            is recorded.
          </Notice>
        )}

        {openEvents.length === 0 ? (
          <div className="mt-6 grid justify-items-start gap-3">
            <p className="text-base text-foreground">
              No event is taking entries right now.
            </p>
            <a
              href={`/e/${encodeURIComponent(slug)}`}
              className="text-sm text-accent underline underline-offset-4"
            >
              Back to the tournament page
            </a>
          </div>
        ) : (
          <form
            id="enter"
            method="post"
            action={`/e/api/submit/${slug}`}
            encType="application/x-www-form-urlencoded"
            className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8"
          >
            <div className="grid gap-6">
              {/* Channel two: the double-submit token — the loader's mint,
                  never `viewer.formCsrf`. The NAME comes from `FORM_FIELD`,
                  so the cross-tier pin on it stays load-bearing. */}
              <input type="hidden" name={FORM_FIELD} value={formCsrf} />
              {/* Minted once per rendered form, in the loader; the field name
                  is the backend's `idempotencyKey` (the hyphenated spelling
                  is the header alias a native form cannot send). */}
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

              {Array.from({ length: blocks }, (_, index) => (
                <PlayerBlock
                  key={index}
                  index={index}
                  events={openEvents}
                  askBirthYear={askBirthYear}
                  said={echo.players[index] ?? NO_ECHO}
                  showAll={echo.showAllEvents}
                />
              ))}

              {/* Z12: an explicit action, not a permanently rendered blank
                  card. `formAction` aims at THIS route's own action — a
                  render round trip, no backend call, works signed-out — and
                  the parser drops an untouched block at submit time. */}
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

              <label className="flex items-start gap-2 text-sm text-foreground">
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

              <section className="grid gap-3 rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm">
                <h2 className="text-base font-semibold text-foreground">Before you submit</h2>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" name="acknowledged" value="on" required />
                  <span>
                    I have read and accept the regulations, and I understand each
                    player&rsquo;s name will appear on this page&rsquo;s public entrant
                    list.
                  </span>
                </label>
              </section>
            </div>

            {/* Z14 + refinement 3. Its "Update total" submit carries the
                quote formAction; `?signedIn=1` is TRANSPORT on the quote URL
                (presence only — the backend appends its own suffix), so the
                write post never carries it. */}
            <StickyTotalBar
              state={bar}
              chip={chip}
              deadline={deadline}
              quoteAction={`/e/api/quote/${slug}${justSignedIn ? '?signedIn=1' : ''}`}
            />
          </form>
        )}

        {/* Signing out lives here: the enter page is the page a signed-in
            entrant is on, and it already mints the nonce this form needs —
            a standalone page would mint a second nonce at Path=/ and
            last-issuance-wins would invalidate a half-filled form in another
            tab. Rendered on both variants (no node page can see the session;
            logout is idempotent); what changes is the claim. A POST, never a
            link: a GET that signed out would be CSRF-able by any prefetch. */}
        <footer className="mt-10 grid gap-1 border-t border-rule-soft pt-4 text-sm">
          {justSignedIn ? null : (
            <p className="text-muted-foreground">
              Signed in on this device? You can sign out here.
            </p>
          )}
          <form method="post" action="/e/account/logout" className="flex flex-wrap items-baseline gap-3">
            <input type="hidden" name={FORM_FIELD} value={formCsrf} />
            {/* Never omitted: `logout`'s own fallback is `/e/account/login`,
                which is POST-only — a 405 after a successful sign-out. */}
            <input type="hidden" name="next" value={`/e/${encodeURIComponent(slug)}`} />
            <Button type="submit">Sign out</Button>
            <span className="text-muted-foreground">
              Signs you out on this device only. Entries you have already submitted
              are unaffected.
            </span>
          </form>
        </footer>
      </main>
    </PlayShell>
  );
}

/** Reads the status and nothing else — no upstream prose or topology on a
 * public page. Same copy as the tournament page's boundary. */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main>
        <h1>This entry page is not available</h1>
        <p>Check the link, or ask the organiser for the current one.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>Please try again in a moment.</p>
    </main>
  );
}
