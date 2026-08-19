/**
 * `/e/{slug}/receipt/{submissionId}` — the G in POST/redirect/GET.
 *
 * `POST /e/api/submit/{slug}` answers 303 here (`api/entries_json.py:714-720`),
 * so the browser's history entry is a GET and a reload re-fetches a page
 * instead of re-posting an entry. Belt and braces: this module exports no
 * `action`, so there is structurally nothing for a refresh to re-fire.
 *
 * **Why this route reads no submission, and what that buys.**
 * `services/submissions.find_for_account` exists precisely so that whoever
 * reads one act *by id* cannot forget to name the account — the 303 puts a
 * submission id in a `Location` header and then in an address bar, where it is
 * a handle and never a capability. The right way to honour that here is not to
 * call it carefully; it is not to have the read. Node holds no entrant
 * credential (spec §3) and must not grow one — a deputy that forwarded the
 * session cookie would collapse the CSRF argument the whole phase rests on —
 * so an account-scoped fetch is not something this tier can do correctly at
 * all. The receipt is therefore the reference, the total the server itself put
 * in the redirect, and the public page's own branding and payment terms.
 * Listing what was entered is E2 "my entries" (spec §1, Phase 7), and it is
 * fetched from the BROWSER, which holds the cookie.
 *
 * The consequence, stated rather than glossed: entrant B pasting entrant A's
 * receipt URL sees a page assembled from a public projection, their own query
 * string and a UUID they already had. Nothing of A's is on it. That is a
 * property of the missing read, so `tests/receipt.test.ts` pins the outbound
 * call list and pins that A, B and an anonymous stranger are served the same
 * bytes — both go red the moment a read appears.
 *
 * The total in the query is the server's own (`compute_fee_total`, the same
 * call the write path makes — Seam B), carried the same way the quote redirect
 * already carries it (`api/entries_json.py:485-513`). It is DISPLAY: the query
 * string is editable by whoever holds the URL, so it is shown as the amount
 * recorded and is never posted back or recomputed from.
 *
 * **There is no "already recorded" state, and that is a ruling, not an
 * omission.** The brief specified a `replayed` flag in the redirect. The
 * codebase had already ruled the other way, twice — `api/entries_json.py:711`
 * and `SubmissionResult.replayed`'s docstring both say a replay must answer
 * the SAME receipt, because a retrying client that saw a different answer
 * would conclude its first attempt had failed. So the server does not send it,
 * and this page does not read it: a `?replayed=1` that only a URL's author can
 * set would let a stranger tell an entrant their entry was a duplicate.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { SectionCard } from '../components/SectionCard';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { formatCents } from '../lib/money';
import type { Route } from './+types/receipt';

/**
 * The three fields the receipt renders — NOT the whole `EntryPageDTO` the
 * brief declared.
 *
 * A loader's return value is serialized verbatim into
 * `window.__reactRouterContext` for hydration, so whatever it returns is in
 * the HTML whether a component renders it or not. Handing `EntryPageDTO`
 * straight through would therefore ship the events list, the entrants list and
 * `viewer.formCsrf` into a page that shows none of them, and would ship any
 * field a future projection grows without anyone editing this file. Found by
 * the disclosure control in `tests/receipt.test.ts`, which puts a private
 * field on the wire: the rendered markup was clean and the hydration payload
 * was not. Narrowing here is the fix; the copy is three lines.
 */
export interface ReceiptPage {
  tournamentName: string | null;
  paymentInstructions: string | null;
}

export interface ReceiptLoaderData {
  page: ReceiptPage;
  /** The route param, not a copy of it read back off the projection — the
   * fetch only succeeded because they already agree (`loader`, above). */
  slug: string;
  submissionId: string;
  /** The server-stated total, or `null` when the redirect did not carry one.
   * Never `0` by default — a zero on a receipt is a claim about money nobody
   * made (`app/lib/money.ts`). */
  totalCents: number | null;
}

/** The redirect only ever names a submission's UUID. Anything else is a
 * stranger's sentence, and this page would render it as the "Reference" under
 * the organizer's own name — content injection, not XSS. */
const SUBMISSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The uniform 404, constructed fresh — never copied from upstream, so the
 * causes stay byte-identical here as they already are in the backend. */
function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { slug?: string; submissionId?: string };
}): Promise<ReceiptLoaderData> {
  const { slug, submissionId } = params;
  if (!slug || !submissionId || !SUBMISSION_ID.test(submissionId)) throw notFound();

  let projection: EntryPageDTO;
  try {
    projection = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  // `request` is read for its URL and for nothing that carries identity — the
  // structural guards in `tests/entry.loader.test.ts` enumerate this file and
  // hold that line.
  const query = new URL(request.url).searchParams;
  // Validate the RAW string, not the coerced number: `Number('')` is `0`,
  // `Number('0x10')` is `16`, `Number('1e3')` is `1000` — every one of those
  // is a well-formed argument to `Number()` and none of them is a total the
  // server put in the redirect. Only a plain non-negative digit string is.
  const raw = query.get('totalCents');
  const total = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;

  return {
    page: {
      tournamentName: projection.tournament.name,
      paymentInstructions: projection.page.paymentInstructions,
    },
    slug,
    submissionId,
    totalCents: total !== null && Number.isInteger(total) && total >= 0 ? total : null,
  };
}

/**
 * Document title (2026-08-11 design audit, finding #4, deferred half — see
 * `root.tsx`). The last of the three; a receipt is the page an entrant is
 * likeliest to bookmark, so an untitled tab here is the sharpest instance of
 * the gap.
 *
 * `data` is `undefined` on the 404 branch (`notFound()` thrown before the
 * loader returns), so this reads only `data.page` — the same allowlist
 * `tournament.tsx` and `enter.tsx` hold themselves to (I6) — and falls back to
 * a generic title rather than guessing a name for a page that never
 * resolved. `slug` and `submissionId` sit right next to `page` on
 * `ReceiptLoaderData` and are just as public, but the title has no use for
 * either, so neither is read.
 */
export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: 'Receipt not available · ShuttleWorks Tournaments' }];
  const { tournamentName } = data.page;
  return [{ title: tournamentName ? `Entry received · ${tournamentName}` : 'Entry received' }];
};

export default function Receipt({ loaderData }: Route.ComponentProps) {
  const { page, slug, submissionId, totalCents } = loaderData;

  return (
    // E1: the shell every other page wears. The receipt is the last screen of
    // the entry journey and used to end it outside the page system — no
    // header, no footer, nowhere to go next. `SectionCard` is the tier's own
    // card skin, so this page now matches the Overview cards it follows.
    <PlayShell>
      <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          {/* One heading, whichever post landed here. A replay is not a
              different outcome and must not read as one — see the ruling in
              the module header.

              2026-08-11 design audit, finding #7: "Entry received" is a rare,
              high-stakes moment (MOTION.md §2's one-delight-beat tier) and
              read as flat as any neutral content. `.motion-enter` ships free
              in the imported design-system CSS — zero page-weight cost, it's
              already in the stylesheet every page loads. `prefers-reduced-
              motion` guard for it is LOCAL (`app.css`), not the design
              system's: `.motion-enter` isn't yet in globals.css's kill list,
              and that fix belongs to another agent. */}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground motion-enter">
            Entry received
          </h1>
          <p className="text-sm text-muted-foreground">
            The organizer has your entry. Keep the reference below if you need to
            ask about it.
          </p>
        </header>

        <SectionCard title="Your entry">
          <p>
            <span className="text-muted-foreground">Tournament</span>{' '}
            {page.tournamentName}
          </p>
          <p className="break-all">
            <span className="text-muted-foreground">Reference</span>{' '}
            <code className="tabular-nums">{submissionId}</code>
          </p>
          {totalCents === null ? null : (
            <p>
              <span className="text-muted-foreground">Amount recorded</span>{' '}
              <strong className="tabular-nums">{formatCents(totalCents)}</strong>
            </p>
          )}
        </SectionCard>

        {page.paymentInstructions ? (
          <SectionCard title="Payment">
            <p className="whitespace-pre-line">{page.paymentInstructions}</p>
          </SectionCard>
        ) : null}

        <p className="text-sm">
          <a
            className="text-accent underline underline-offset-4"
            href={`/e/${slug}`}
          >
            Back to the tournament page
          </a>
        </p>
      </main>
    </PlayShell>
  );
}

/** Reads the status and nothing else, so no upstream prose or topology can
 * reach a public page. Same posture as `entry.tsx`'s boundary; kept local
 * rather than shared while there are two of them and their copy differs. */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="This receipt is not available"
        body="Check the link, or ask the organizer to look the entry up."
      />
    );
  }

  return (
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}
