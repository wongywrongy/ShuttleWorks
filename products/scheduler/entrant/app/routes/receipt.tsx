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
import { Card, CardContent } from '@scheduler/design-system/components';

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
  slug: string;
  paymentInstructions: string | null;
}

export interface ReceiptLoaderData {
  page: ReceiptPage;
  submissionId: string;
  /** The server-stated total, or `null` when the redirect did not carry one.
   * Never `0` by default — a zero on a receipt is a claim about money nobody
   * made (`app/lib/money.ts`). */
  totalCents: number | null;
}

/** The redirect only ever names a submission's UUID. Anything else is a
 * stranger's sentence, and this page would render it as the "Reference" under
 * the organiser's own name — content injection, not XSS. */
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
  const total = Number(query.get('totalCents'));

  return {
    page: {
      tournamentName: projection.tournament.name,
      slug: projection.page.slug,
      paymentInstructions: projection.page.paymentInstructions,
    },
    submissionId,
    totalCents:
      query.get('totalCents') !== null && Number.isInteger(total) && total >= 0
        ? total
        : null,
  };
}

export default function Receipt({ loaderData }: Route.ComponentProps) {
  const { page, submissionId, totalCents } = loaderData;

  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-4">
      {/* One heading, whichever post landed here. A replay is not a different
          outcome and must not read as one — see the ruling in the header. */}
      <h1 className="text-2xl font-semibold">Entry received</h1>

      <Card>
        <CardContent className="grid gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Tournament</span>{' '}
            {page.tournamentName}
          </p>
          <p className="break-all">
            <span className="text-muted-foreground">Reference</span>{' '}
            <code>{submissionId}</code>
          </p>
          {totalCents === null ? null : (
            <p>
              <span className="text-muted-foreground">Amount recorded</span>{' '}
              <strong>{formatCents(totalCents)}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {page.paymentInstructions ? (
        <section>
          <h2 className="text-lg font-semibold">Payment</h2>
          <p className="whitespace-pre-line text-sm">{page.paymentInstructions}</p>
        </section>
      ) : null}

      <p className="text-sm">
        <a className="underline" href={`/e/${page.slug}`}>
          Back to the entry page
        </a>
      </p>
    </main>
  );
}

/** Reads the status and nothing else, so no upstream prose or topology can
 * reach a public page. Same posture as `entry.tsx`'s boundary; kept local
 * rather than shared while there are two of them and their copy differs. */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main>
        <h1>This receipt is not available</h1>
        <p>Check the link, or ask the organiser to look the entry up.</p>
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
