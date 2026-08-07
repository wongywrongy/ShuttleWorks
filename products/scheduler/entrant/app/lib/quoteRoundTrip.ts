/**
 * The hydrated half of "Update events and total" — browser-only.
 *
 * **The browser makes this request; node never does.** It runs inside a click
 * handler on the entry form, so the entrant's session cookie is attached by
 * the browser itself and `X-ShuttleWorks-CSRF: 1` is attached by a script the
 * same origin served. Manufactured in node those two would prove nothing: the
 * header exists precisely because a cross-site page cannot attach it without a
 * preflight this app does not approve (`app/form_csrf.py`), and a node process
 * asserting it would launder that proof away (spec §3). Nothing in this module
 * reads a credential — it is handed a form body and sends it.
 *
 * `/e/api/quote/{slug}` is **session-gated by ruling R8-C**, not a public fee
 * oracle: it reads a director's price list against a caller-chosen basket.
 *
 * **It returns a query string, not a total.** The caller navigates to it, the
 * loader re-runs, and `parseEcho` renders it — the same code path the
 * unhydrated 303 produces. That is deliberate and load-bearing: there is one
 * renderer for the total, one for the narrowing and one for the refusal, so
 * "hydrated and unhydrated agree" is structural rather than a coincidence
 * maintained by hand. And no fee arithmetic happens on this side of the wire
 * (R14) — `totalCents` is copied from the answer or omitted.
 */

/** Transport, not typing: none of it belongs in the address bar. The key
 * especially — it is minted per rendered form in the loader, and echoing a
 * spent one would pin it there across re-renders. */
const DROPPED: ReadonlySet<string> = new Set(['_csrf', 'idempotencyKey', 'action']);

/** Shown when the round trip did not produce an answer. Fixed local copy: an
 * upstream 500 body can carry a stack frame or an internal hostname, and a
 * stale total left on screen is a number the entrant would believe. */
const UNAVAILABLE =
  'Could not work out the total just now. Press the button again, or submit and the organiser will confirm.';

interface QuoteAnswer {
  totalCents?: number | null;
  refusal?: { message?: string } | null;
}

export async function requestQuote(slug: string, body: FormData): Promise<string> {
  // URL-encoded, exactly like the native post, so one Python parser
  // (`parse_players`) reads both paths.
  const posted = new URLSearchParams(
    [...body].filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
  );

  let answer: QuoteAnswer | null = null;
  try {
    const res = await fetch(`/e/api/quote/${encodeURIComponent(slug)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-ShuttleWorks-CSRF': '1' },
      body: posted,
    });
    if (res.ok) answer = (await res.json()) as QuoteAnswer;
  } catch {
    // Offline, or the request was refused before a body existed. Treated the
    // same as a refusal to price: the typing survives, the number does not.
    answer = null;
  }

  const echo = new URLSearchParams(
    [...posted].filter(([name]) => !DROPPED.has(name)),
  );
  if (answer === null) {
    echo.append('refusal', UNAVAILABLE);
    return `?${echo}`;
  }
  if (typeof answer.totalCents === 'number') {
    echo.append('totalCents', String(answer.totalCents));
  }
  if (answer.refusal?.message) echo.append('refusal', answer.refusal.message);
  return `?${echo}`;
}
