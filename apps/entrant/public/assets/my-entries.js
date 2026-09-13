/**
 * My Entries (SP-P7 §3.1) — the page's one script, and the tier's first.
 *
 * **Why a plain external module and not hydration.** The tier is SSR-first:
 * `app/root.tsx` has no framework hydration bootstrap, while bounded route
 * modules are allowed where a page needs browser-only data. My Entries is the first page whose DATA is
 * credentialed — node must not read the session (R8-D), so the browser has
 * to — and `script-src 'self'` already permits an external same-origin
 * module. One page, one small script, zero CSP surgery; the pattern scales
 * to the entrants filter without restoring framework hydration or inline script execution.
 *
 * **Safety shape:** every string reaches the page through `textContent` —
 * there is no innerHTML and no HTML string assembly anywhere in this file,
 * so entrant-authored names cannot become markup. The fetch is same-origin
 * with the browser's default credentials behaviour; nothing here reads,
 * stores, or forwards the cookie itself.
 *
 * Pure decisions (grouping, chips, price lines, link existence) are
 * exported for the vitest suite (`tests/myEntries.script.test.ts`); the DOM
 * half runs only when the mount point exists.
 */

import { personRefModel, createPersonRef } from './person-ref.js';

// ---- pure decisions -------------------------------------------------------

/** Cents → "55.00"; null → "" (mirrors app/lib/money.ts — no symbol: no
 * currency field exists, and inventing one would be a lie with a $ on it). */
export function formatCents(cents) {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
}

/** An amount with the organizer's currency where they stated one
 * (`GBP 55.00`), else the figure plus a plain "currency not stated"
 * (refinement 2026-09-12; mirrors `app/lib/money.ts` `formatMoney`). */
export function formatMoney(cents, currency) {
  const figure = formatCents(cents);
  if (figure === '') return '';
  const code = (currency ?? '').trim().toUpperCase();
  return code === '' ? `${figure} (currency not stated)` : `${code} ${figure}`;
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
];

/** "2026-09-12" → "12 September 2026"; anything else → "". Weekday-less on
 * purpose: the card is a list row, not a hero line. */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  const month = MONTHS_LONG[Number(m[2]) - 1];
  if (!month) return '';
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** Year groups, newest first, card order preserved; dateless cards group
 * under "Undated" at the end — listed, never guessed at. */
export function yearGroups(cards) {
  const groups = [];
  for (const card of cards) {
    const year = /^(\d{4})-\d{2}-\d{2}$/.exec(card.date ?? '')?.[1] ?? 'Undated';
    const found = groups.find((g) => g.year === year);
    if (found) found.cards.push(card);
    else groups.push({ year, cards: [card] });
  }
  return groups.sort((a, b) =>
    a.year === 'Undated' ? 1 : b.year === 'Undated' ? -1 : b.year.localeCompare(a.year),
  );
}

/** The status word per card status: label + the tier's tone vocabulary.
 *
 * P9/D9: `played` is now claimed by the backend only where a published
 * result actually names the player, and `past` is the honest label for a
 * confirmed entry whose tournament date has gone by with no such evidence.
 * `rejected` says so in the entrant's words rather than disappearing into
 * "Withdrawn". */
export function cardChip(status) {
  return (
    {
      awaiting: { label: 'Awaiting confirmation', tone: 'plain' },
      waitlisted: { label: 'Waitlisted', tone: 'plain' },
      entered: { label: 'Entered', tone: 'live' },
      played: { label: 'Played', tone: 'done' },
      past: { label: 'Entered', tone: 'plain' },
      rejected: { label: 'Not accepted', tone: 'plain' },
      withdrawn: { label: 'Withdrawn', tone: 'plain' },
    }[status] ?? { label: 'Awaiting confirmation', tone: 'plain' }
  );
}

/** Active vs past is a GROUPING question and the server answers it — the
 * card carries `isPast`, derived from the effective event clock, so the
 * page never has to compare the browser's idea of today against a date
 * string. The two older statuses are accepted as evidence of pastness so an
 * older payload (or a test fixture) still groups sensibly. */
export function isPastCard(card) {
  return card?.isPast === true || card?.status === 'played' || card?.status === 'past';
}

/** Two sections, active first, card order preserved inside each. Either
 * section is omitted when empty — an empty "Past" heading is furniture. */
export function activeAndPast(cards) {
  const groups = [
    { key: 'active', label: 'Active', cards: cards.filter((c) => !isPastCard(c)) },
    { key: 'past', label: 'Past', cards: cards.filter((c) => isPastCard(c)) },
  ];
  return groups.filter((group) => group.cards.length > 0);
}

/** ISO UTC instant -> "5 Sep 2026, 18:00 UTC" (no JS helper importable from
 * `app/lib` on this page-script tier, per the tier's own boundary — see the
 * file banner). */
export function formatWithdrawDeadline(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

/** Quoted while awaiting, plain total after; nothing on withdrawn cards or
 * unpriced pages. Register per the mockup review, symbol-less per the tier.
 *
 * P9/D9 + D1: the withdrawal deadline is no longer glued on behind a middle
 * dot — it is its own line (`withdrawLine`), and both live inside the entry
 * detail rather than on the summary row. */
export function priceLine(card) {
  if (card.feeTotalCents === null || card.feeTotalCents === undefined) return null;
  if (card.status === 'withdrawn' || card.status === 'rejected') return null;
  if (card.status === 'awaiting') {
    return `Quoted ${formatMoney(card.feeTotalCents, card.feeCurrency)}, payable to the organizer`;
  }
  return `Total ${formatMoney(card.feeTotalCents, card.feeCurrency)}`;
}

/**
 * The wire's pending reasons, in the entrant's words (refinement
 * 2026-09-12). Each names what is actually happening in the process, never
 * the desk's queue vocabulary: "Player identity review needed" told an
 * entrant nothing they could recognise as their own situation.
 */
export const PENDING_REASON_TEXT = Object.freeze({
  awaiting_partner: 'Waiting for your partner to accept',
  awaiting_payment: 'Payment outstanding',
  over_cap: 'Waiting for a place',
  needs_review: "Waiting for the organizer's decision",
  needs_review_person: "The organizer is checking this player's details",
  pair_conflict: 'The organizer is checking this pairing',
});

export function pendingReasonText(reason) {
  return Object.hasOwn(PENDING_REASON_TEXT, reason) ? PENDING_REASON_TEXT[reason] : null;
}

/**
 * The card's ONE next step, separated from its status (refinement
 * 2026-09-12): what, if anything, the entrant or the organizer still has to
 * do, in plain language, with at most one action beside it. The status word
 * says where the entry stands; this says what happens next. Every other
 * requirement stays reachable inside "View entry".
 *
 * Precedence, most actionable first: something the ENTRANT can do now
 * (an outstanding payment — the receipt carries the instructions; an
 * unconfirmed email that blocks changes — the verify page resends), then
 * what they are waiting on someone else for. `null` for a settled card.
 */
export function nextStep(card, emailVerified) {
  const lines = card?.events ?? [];
  const live = lines.filter((line) => line.state !== 'withdrawn' && line.state !== 'rejected');
  if (live.length === 0 || isPastCard(card)) return null;
  const reasons = new Set(live.flatMap((line) => line.pendingReasons ?? []));
  const receipt = receiptHref(card);
  if (reasons.has('awaiting_payment')) {
    return {
      text: "Payment outstanding. Follow the organizer's instructions on your receipt.",
      action: receipt ? { label: 'View receipt', href: receipt } : null,
    };
  }
  if (live.some((line) => line.partnerInviteMailFailed)) {
    return {
      text: 'The invitation email to your partner could not be sent. Let them know directly.',
      action: null,
    };
  }
  if (reasons.has('awaiting_partner')) {
    return { text: 'Waiting for your partner to accept the invitation.', action: null };
  }
  for (const reason of ['pair_conflict', 'needs_review_person', 'needs_review', 'over_cap']) {
    if (reasons.has(reason)) return { text: `${PENDING_REASON_TEXT[reason]}.`, action: null };
  }
  if (!emailVerified && live.some((line) => line.canWithdraw)) {
    return {
      text: 'Confirm your email address to change or withdraw this entry.',
      action: { label: 'Confirm your email', href: '/e/verify' },
    };
  }
  if (card.status === 'awaiting' || live.some((line) => line.state === 'awaiting' || line.state === 'waitlisted')) {
    return { text: 'Waiting for the organizer to confirm.', action: null };
  }
  return null;
}

/** The still-open self-serve withdrawal window, as its own statement. */
export function withdrawLine(card) {
  const deadline = formatWithdrawDeadline(card.withdrawsUntil);
  return deadline ? `You can withdraw yourself until ${deadline}` : null;
}

/** A line wears its own chip only when it disagrees with the card. */
export function lineChip(cardStatus, state) {
  if (state === 'withdrawn') return 'Withdrawn';
  if (state === 'rejected') return 'Not accepted';
  if (state === 'waitlisted') return 'Waitlisted';
  if (state === 'awaiting' && cardStatus !== 'awaiting') return 'Awaiting confirmation';
  if (state === 'entered' && cardStatus === 'awaiting') return 'Entered';
  return null;
}

/** "View receipt" exists whenever the card names both a slug and the
 * submission it represents — every card qualifies once the backend fills
 * in `shortReference`, so this is really just the null-safety guard.
 *
 * V3-24-1: built from the SHORT REFERENCE, not the UUID. The receipt route
 * accepts only that shape now, so a link built from `submissionId` would be
 * a 404 — and the address bar an entrant arrives at is then the same string
 * the page tells them to quote. */
export function receiptHref(card) {
  if (!card.slug || !card.shortReference) return null;
  return `/e/${encodeURIComponent(card.slug)}/receipt/${encodeURIComponent(card.shortReference)}`;
}

/** "View results" exists only where the player page answers (§4): played
 * card, published entrant pages, and a real person key to point at. */
export function resultsHref(card, line) {
  if (!isPastCard(card) || !card.entrantsPublished) return null;
  const personId = line.player?.identity?.id;
  if (!card.slug || !personId) return null;
  return `/e/${encodeURIComponent(card.slug)}/players/${encodeURIComponent(personId)}`;
}

/**
 * The withdraw affordance for one line, or `null` for none (E2).
 *
 * Pure, and exported, because it is the page's one piece of judgement about
 * an irreversible act and it deserves a test rather than a read-through of
 * the DOM builder. Three inputs, three outcomes:
 *
 * - the account is unverified -> a REASON, not a button. The route would
 *   403, and a control that always fails teaches the reader to distrust
 *   every other control on the page.
 * - the line is not withdrawable (already withdrawn, decided, or past the
 *   organiser's deadline) -> nothing at all. `canWithdraw` is the server's
 *   own predicate, so this never disagrees with the route.
 * - otherwise -> the one action, withdraw (erasure is an option inside its
 *   confirmation, not a second competing button — see `withdrawControls`).
 */
export function withdrawAffordance(line, emailVerified) {
  if (!line?.entryId) return null;
  if (!emailVerified) {
    return { kind: 'reason', text: 'Confirm your email to change entries' };
  }
  if (!line.canWithdraw) return null;
  return { kind: 'actions', entryId: line.entryId };
}

// ---- DOM ------------------------------------------------------------------

/** Card status reads as a plain weighted word in its tone (ADR 0027: no pill, no dot). */
const STATUS_TEXT_CLASS = {
  live: 'text-status-live',
  done: 'text-status-done',
  plain: 'text-muted-foreground',
};

/** JS twin of `app/lib/ui.ts` `CHIP` — pinned equal by `tests/uiTwins.test.ts`. */
const CHIP =
  'inline-flex h-badge items-center rounded-xs border px-2.5 text-xs font-medium leading-none';

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusEl(doc, label, tone) {
  return el(
    doc,
    'span',
    `shrink-0 text-sm font-medium ${STATUS_TEXT_CLASS[tone] ?? STATUS_TEXT_CLASS.plain}`,
    label,
  );
}

function resultsLink(doc, href) {
  const view = el(
    doc,
    'a',
    'text-sm font-medium text-accent underline-offset-4 hover:underline',
    'View results',
  );
  view.href = href;
  return view;
}

function receiptLink(doc, href) {
  const view = el(
    doc,
    'a',
    'text-sm font-medium text-accent underline-offset-4 hover:underline',
    'View receipt',
  );
  view.href = href;
  return view;
}

/** The local simulator's bootstrap workspace label is an implementation
 * fallback, not organizer information an entrant can act on — the receipt and
 * the tournament frame suppress it too (P9/D9: "remove generic organization
 * fallback text"). */
function realOrgName(name) {
  return name && name !== 'Local Workspace' ? name : null;
}

/** A field on the entry detail: small label, plain value, no separators. */
function factEl(doc, term, value) {
  const wrap = el(doc, 'div', 'grid gap-0.5');
  wrap.appendChild(
    el(doc, 'dt', 'text-xs font-medium uppercase tracking-wide text-muted-foreground', term),
  );
  wrap.appendChild(el(doc, 'dd', 'text-sm text-foreground', value));
  return wrap;
}

/**
 * One card: a summary a reader can scan, and one disclosure holding the
 * management detail (P9/D9).
 *
 * The summary carries tournament and date, then one row per entry with the
 * participant, the event, the partner where there is one, and the precise
 * state. Everything else the old card printed on every line — fees, the
 * reference, the withdrawal deadline, the receipt link, the withdraw
 * controls — moved inside "View entry", which is the one action on the
 * summary.
 */
function cardEl(doc, card, emailVerified) {
  const article = el(
    doc,
    'article',
    'rounded-lg border border-rule-soft bg-surface-raised',
  );

  const head = el(
    doc,
    'header',
    'flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-soft px-6 py-4',
  );
  const title = el(doc, 'div', 'min-w-0');
  if (card.slug) {
    const link = el(
      doc,
      'a',
      'text-base font-semibold text-foreground hover:underline',
      card.tournamentName ?? card.slug,
    );
    link.href = `/e/${encodeURIComponent(card.slug)}`;
    title.appendChild(link);
  } else {
    title.appendChild(
      el(doc, 'p', 'text-base font-semibold text-foreground',
        card.tournamentName ?? 'Tournament'),
    );
  }
  // D1: date and venue are two fields with space between them, not one
  // middle-dot string. The organizer name is dropped from the summary
  // altogether — it is on the tournament page, and the fallback label was
  // noise on every row.
  const meta = el(doc, 'p', 'mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground');
  for (const part of [formatDate(card.date), card.venueName]) {
    if (part) meta.appendChild(el(doc, 'span', undefined, part));
  }
  if (meta.childNodes.length > 0) title.appendChild(meta);
  head.appendChild(title);
  const status = cardChip(card.status);
  head.appendChild(statusEl(doc, status.label, status.tone));
  const step = nextStep(card, emailVerified);
  if (step) {
    const row = el(doc, 'p', 'flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 text-sm');
    row.appendChild(el(doc, 'span', 'text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground', 'Next step'));
    row.appendChild(el(doc, 'span', 'text-foreground', step.text));
    if (step.action) {
      const go = el(doc, 'a', 'text-sm font-medium text-accent underline-offset-4 hover:underline', step.action.label);
      go.href = step.action.href;
      row.appendChild(go);
    }
    head.appendChild(row);
  }
  article.appendChild(head);

  // One card holds every line this account submitted for the tournament,
  // which can be several people (a parent entering two children). The
  // detail carries the "View results" link when the card resolves to ONE
  // player page; with several distinct pages each line keeps its own link,
  // because one label would name nobody.
  const resultHrefs = [
    ...new Set((card.events ?? []).map((line) => resultsHref(card, line)).filter(Boolean)),
  ];
  const footerHref = resultHrefs.length === 1 ? resultHrefs[0] : null;

  const lines = el(doc, 'ul', 'px-6 divide-y divide-rule-soft');
  for (const line of card.events ?? []) {
    const row = el(
      doc,
      'li',
      'flex flex-wrap items-baseline justify-between gap-4 py-2.5 text-sm text-foreground',
    );
    const lead = el(doc, 'span', 'flex min-w-0 flex-wrap items-baseline gap-x-2');
    lead.appendChild(createPersonRef(doc, {
      slug: card.slug ?? '',
      identity: line.player?.identity ?? null,
      state: line.player?.resolution ?? 'dead',
      label: line.player?.label ?? 'Player',
      className: 'font-medium',
    }));
    if (line.partner) {
      lead.appendChild(el(doc, 'span', 'text-muted-foreground', 'with'));
      lead.appendChild(createPersonRef(doc, {
        slug: card.slug ?? '',
        identity: line.partner.identity ?? null,
        state: line.partner.resolution ?? 'dead',
        label: line.partner.label ?? 'Partner',
      }));
    }
    lead.appendChild(el(doc, 'span', 'font-medium', line.eventCode));
    lead.appendChild(el(doc, 'span', 'text-muted-foreground', line.discipline));
    row.appendChild(lead);
    const own = lineChip(card.status, line.state);
    if (own) {
      row.appendChild(
        el(doc, 'span', `${CHIP} border-rule-control text-muted-foreground`, own),
      );
    }
    for (const reason of line.pendingReasons ?? []) {
      const text = pendingReasonText(reason);
      if (text) row.appendChild(el(doc, 'span', 'text-xs text-muted-foreground', text));
    }
    if (line.resultBadge) {
      row.appendChild(
        el(doc, 'span', `${CHIP} border-status-done text-status-done`, line.resultBadge),
      );
    }
    if (line.partnerInviteMailFailed) {
      // V3-PE37.1: an honest statement, not a fake recovery action. The
      // invite token is only ever stored hashed (invariant I5), so there is
      // no link left to re-share, and no resend route exists — the truthful
      // thing to say is what happened and what the entrant can still do
      // about it themselves.
      row.appendChild(
        el(
          doc,
          'span',
          'w-full text-xs text-status-attention',
          'The invitation email to your partner could not be sent. Let them know directly.',
        ),
      );
    }
    lines.appendChild(row);
  }
  article.appendChild(lines);

  article.appendChild(detailEl(doc, card, emailVerified, footerHref));
  return article;
}

/**
 * "View entry" — the card's one action, and everything management-shaped
 * behind it (P9/D9).
 *
 * A native `<details>`: no route, no state to keep, keyboard-operable for
 * free, and it collapses again. Inside it, in this order: the money and the
 * reference the organizer will ask for, the links out (receipt, results),
 * and last the withdrawal, which is the only irreversible thing here.
 */
function detailEl(doc, card, emailVerified, footerHref) {
  const details = el(doc, 'details', 'border-t border-rule-soft px-6 py-3');
  const summary = el(
    doc,
    'summary',
    'cursor-pointer text-sm font-medium text-accent underline-offset-4 hover:underline',
    'View entry',
  );
  details.appendChild(summary);

  const body = el(doc, 'div', 'grid gap-4 pt-3');
  const facts = el(doc, 'dl', 'grid gap-3 sm:grid-cols-2');

  // V3-24-1: a card folds every act this account made against one
  // tournament. The card's own reference is the newest; a line entered under
  // an older act names its own, because "quote your reference" is useless
  // advice when the entrant holds two and the page shows one.
  if (card.shortReference) {
    facts.appendChild(factEl(doc, 'Reference', card.shortReference));
  }
  const olderRefs = [
    ...new Set(
      (card.events ?? [])
        .map((line) => line.shortReference)
        .filter((ref) => ref && ref !== card.shortReference),
    ),
  ];
  if (olderRefs.length > 0) {
    facts.appendChild(factEl(doc, 'Earlier entries', olderRefs.join(', ')));
  }
  const price = priceLine(card);
  if (price) facts.appendChild(factEl(doc, 'Fees', price));
  const org = realOrgName(card.orgName);
  if (org) facts.appendChild(factEl(doc, 'Organizer', org));
  const withdrawal = withdrawLine(card);
  if (withdrawal) facts.appendChild(factEl(doc, 'Withdrawal', withdrawal));
  if (facts.childNodes.length > 0) body.appendChild(facts);

  const links = el(doc, 'p', 'flex flex-wrap items-center gap-4');
  const receiptHrefValue = receiptHref(card);
  if (receiptHrefValue) links.appendChild(receiptLink(doc, receiptHrefValue));
  if (footerHref) links.appendChild(resultsLink(doc, footerHref));
  for (const line of card.events ?? []) {
    const href = footerHref ? null : resultsHref(card, line);
    if (href) links.appendChild(resultsLink(doc, href));
  }
  if (links.childNodes.length > 0) body.appendChild(links);

  // One withdrawal control per entry that the SERVER says can be withdrawn
  // right now — `canWithdraw` is `assert_withdrawable` asked rather than
  // re-implemented, so a control that renders is one the route accepts.
  const manage = el(doc, 'div', 'grid gap-2');
  let reasonShown = false;
  for (const line of card.events ?? []) {
    const affordance = withdrawAffordance(line, emailVerified);
    if (!affordance) continue;
    if (affordance.kind === 'reason') {
      // Once per card, not once per line: the account is unverified, which
      // is one fact about the reader and not a property of each entry.
      if (reasonShown) continue;
      reasonShown = true;
      manage.appendChild(
        el(doc, 'p', 'text-xs text-muted-foreground', affordance.text),
      );
      continue;
    }
    manage.appendChild(withdrawControls(doc, affordance.entryId, card, line));
  }
  if (manage.childNodes.length > 0) body.appendChild(manage);

  details.appendChild(body);
  return details;
}

/** The player and event this withdrawal would affect, in one phrase. */
function withdrawSubject(line) {
  const player =
    personRefModel({ slug: '', identity: line.player?.identity ?? null, state: line.player?.resolution ?? 'dead', label: line.player?.label ?? 'this player' }).text;
  const event = [line.eventCode, line.discipline].filter(Boolean).join(' ');
  return event ? `${player} from ${event}` : player;
}

/**
 * ONE withdrawal action, behind a focused confirmation (P9/D9, E2).
 *
 * **`window.confirm` is banned product-wide** — the 2026-07-11 interaction
 * audit removed the last call site, because a native modal blocks the whole
 * event loop and, in an automated browser, silently deadlocks the page. The
 * replacement everywhere else is the same shape as this: the first press
 * opens a confirmation that states exactly what is about to happen, the
 * second press does it, and Cancel is always the wider target.
 *
 * Withdraw and withdraw-and-erase used to sit side by side as two equally
 * weighted destructive links on every row. They are not two acts — the
 * backend models erasure as a FLAG on the one withdrawal transition
 * (`WithdrawRequest.erase`) — and presenting them as twins invited the
 * reader to pick the irreversible one by mistake. There is one action now;
 * erasure is an unticked option inside its confirmation, described in the
 * entrant's terms, and the request body is byte-for-byte what it was.
 *
 * The confirmation states three things and no more: who is being withdrawn
 * from what, that a doubles partner's own entry is NOT withdrawn with it
 * (`lifecycle.withdraw` touches one entry), and — only when the card knows
 * one — nothing at all about refunds. No money claim is made here, because
 * no refund policy is carried on the wire and an invented one is worse than
 * silence.
 */
function withdrawControls(doc, entryId, card, line) {
  const wrap = el(doc, 'div', 'grid gap-2');
  const linkClass =
    'text-sm font-medium text-muted-foreground underline-offset-4 hover:underline';

  function build() {
    wrap.textContent = '';
    const start = el(doc, 'button', linkClass, 'Withdraw entry');
    start.type = 'button';
    start.addEventListener('click', confirm);
    wrap.appendChild(start);
  }

  function confirm() {
    wrap.textContent = '';
    const panel = el(
      doc,
      'div',
      'grid gap-2 rounded-md border border-rule-soft bg-surface-sunken p-3',
    );
    panel.appendChild(
      el(
        doc,
        'p',
        'text-sm text-foreground',
        `Withdraw ${withdrawSubject(line)}?`,
      ),
    );
    if (line.partner) {
      panel.appendChild(
        el(
          doc,
          'p',
          'text-xs text-muted-foreground',
          'Your partner’s own entry is not withdrawn with yours. Tell them directly.',
        ),
      );
    }
    panel.appendChild(
      el(
        doc,
        'p',
        'text-xs text-muted-foreground',
        'Ask the organizer about anything you have already paid.',
      ),
    );

    const eraseId = `erase-${entryId}`;
    const eraseRow = el(doc, 'label', 'flex items-start gap-2 text-xs text-muted-foreground');
    const erase = doc.createElement('input');
    erase.type = 'checkbox';
    erase.id = eraseId;
    erase.className = 'mt-0.5';
    eraseRow.appendChild(erase);
    eraseRow.appendChild(
      el(
        doc,
        'span',
        undefined,
        'Also erase this player’s personal details. The entry stays as the organizers’ record. This cannot be undone.',
      ),
    );
    panel.appendChild(eraseRow);

    const actions = el(doc, 'div', 'flex flex-wrap items-center gap-3');
    const go = el(
      doc,
      'button',
      'text-sm font-medium text-status-attention underline-offset-4 hover:underline',
      'Withdraw entry',
    );
    go.type = 'button';
    go.addEventListener('click', () => {
      go.disabled = true;
      void submitWithdraw(doc, entryId, erase.checked, wrap);
    });
    const cancel = el(doc, 'button', linkClass, 'Keep it');
    cancel.type = 'button';
    cancel.addEventListener('click', build);
    actions.append(go, cancel);
    panel.appendChild(actions);
    wrap.appendChild(panel);
  }

  build();
  return wrap;
}

/**
 * POST the withdrawal and rewrite the control in place.
 *
 * Carries `X-ShuttleWorks-CSRF` because the middleware requires it of every
 * cookie-carrying write; a native form could not send it, which is why this
 * one control on this one already-scripted page is a fetch rather than the
 * `<form>` every other entrant write uses.
 *
 * The outcome is read from the ANSWER, not applied optimistically: a 409
 * (somebody else moved it, the deadline passed while the page sat open) has
 * to read as "that did not happen", and an optimistic update would have
 * already said it did.
 */
async function submitWithdraw(doc, entryId, erase, wrap) {
  let response;
  try {
    response = await fetch(
      `/e/api/me/entries/${encodeURIComponent(entryId)}/withdraw`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'X-ShuttleWorks-CSRF': '1',
        },
        body: JSON.stringify({ erase }),
      },
    );
  } catch {
    wrap.textContent = '';
    wrap.appendChild(
      el(doc, 'p', 'text-sm text-status-attention', 'Could not reach the server. Try again.'),
    );
    return;
  }
  if (!response.ok) {
    let message = 'That could not be withdrawn. Reload and try again.';
    try {
      const body = await response.json();
      if (typeof body?.detail?.message === 'string') message = body.detail.message;
    } catch {
      /* keep the default — a body we cannot read is not a message. */
    }
    wrap.textContent = '';
    wrap.appendChild(el(doc, 'p', 'text-sm text-status-attention', message));
    return;
  }
  wrap.textContent = '';
  wrap.appendChild(
    el(
      doc,
      'p',
      'text-sm text-muted-foreground',
      erase ? 'Withdrawn, and the details were erased.' : 'Withdrawn.',
    ),
  );
}


/**
 * The account's own two rights, rendered under the cards (E5, spec Q10).
 *
 * **Both ride the account** (R10), which is why they can live on one page
 * behind one login rather than needing a link the entrant must still
 * possess. Export is a plain read the browser saves; erasure is behind the
 * same two-click arm every destructive control in the product uses, because
 * `window.confirm` is banned and because this is the least reversible thing
 * on the surface.
 *
 * The erasure copy states what actually happens, in the entrant's terms and
 * without softening it: the personal details go, the entries stay as records
 * belonging to the organisers. Ruling D7 is a product promise as much as a
 * schema decision, and a page that said "your data will be deleted" would be
 * describing a different product.
 */
export function accountPanel(doc, { onExport, onErase }) {
  const panel = el(
    doc,
    'section',
    'mt-8 grid gap-3 rounded-lg border border-rule-soft bg-surface-raised p-4',
  );
  panel.appendChild(
    // `h3`: this panel now sits INSIDE the page's Settings section (whose
    // `h2` is in `routes/myEntries.tsx`), so the heading level follows the
    // document rather than restarting at 2 in the middle of a section.
    el(doc, 'h3', 'font-display text-base font-bold tracking-tight text-foreground', 'Your account'),
  );

  const actions = el(doc, 'div', 'flex flex-wrap items-center gap-3');
  const linkClass =
    'text-sm font-medium text-accent underline-offset-4 hover:underline';

  const exportButton = el(doc, 'button', linkClass, 'Download my data');
  exportButton.type = 'button';
  exportButton.addEventListener('click', () => void onExport());
  actions.appendChild(exportButton);

  const eraseSlot = el(doc, 'span', 'flex items-center gap-3');
  const armErase = () => {
    eraseSlot.textContent = '';
    eraseSlot.appendChild(
      el(
        doc,
        'span',
        'text-sm text-muted-foreground',
        'Erase your details from every entry? Your entries stay as the organizers\u2019 records. This cannot be undone.',
      ),
    );
    const go = el(
      doc,
      'button',
      'text-sm font-medium text-status-attention underline-offset-4 hover:underline',
      'Erase my details',
    );
    go.type = 'button';
    go.addEventListener('click', () => {
      go.disabled = true;
      void onErase();
    });
    const cancel = el(doc, 'button', linkClass, 'Keep them');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      eraseSlot.textContent = '';
      buildErase();
    });
    eraseSlot.appendChild(go);
    eraseSlot.appendChild(cancel);
  };
  function buildErase() {
    const start = el(
      doc,
      'button',
      'text-sm font-medium text-muted-foreground underline-offset-4 hover:underline',
      'Erase my details',
    );
    start.type = 'button';
    start.addEventListener('click', armErase);
    eraseSlot.appendChild(start);
  }
  buildErase();
  actions.appendChild(eraseSlot);

  panel.appendChild(actions);
  return panel;
}

async function downloadExport(doc) {
  const response = await fetch('/e/api/me/export', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return false;
  const data = await response.json();
  // A Blob URL and a synthetic click: the tier ships no library and the
  // document is the entrant's own. Revoked immediately — the object URL is
  // a handle to their personal data and there is no reason for it to
  // outlive the save dialog.
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = doc.createElement('a');
  link.href = url;
  link.download = 'shuttleworks-my-data.json';
  doc.body.appendChild(link);
  link.click();
  doc.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

/** Render the whole answer into `root` (exported for the test suite). */
export function render(root, data) {
  // `root` is null on the settings page, which has the account mount and
  // no entries list; the document is then the global one.
  const doc = root?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const cards = data?.tournaments ?? [];
  const verified = data?.emailVerified === true;

  // Refinement 2026-09-12: the account's privacy controls live on their own
  // page (`/e/me/settings`, `routes/mySettings.tsx`), which mounts
  // `#my-account-root` and loads this same module. They render wherever
  // that mount exists and nowhere else — never appended to the entries
  // list, which is a different task.
  renderSettings(doc, verified);

  if (!root) return;
  root.textContent = '';
  if (cards.length === 0) {
    root.appendChild(
      el(doc, 'p', 'text-muted-foreground',
        'No entries yet. When you enter a tournament, it appears here.'),
    );
    return;
  }
  // Active first, then past (D9). Grouping by YEAR answered a question
  // nobody asked of this page: what an entrant looks for here is the
  // tournament they still have something to do about.
  for (const group of activeAndPast(cards)) {
    const section = el(doc, 'section', 'grid gap-3');
    section.appendChild(
      el(doc, 'h2', 'mt-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground',
        group.label),
    );
    for (const card of group.cards) {
      section.appendChild(cardEl(doc, card, verified));
    }
    root.appendChild(section);
  }
}

/** Put the account panel in the settings page's mount, if this document has one. */
function renderSettings(doc, verified) {
  const slot = doc.getElementById('my-account-root');
  if (!slot) return;
  slot.textContent = '';
  if (!verified) {
    // Both rights are irreversible or disclosing, and E2's reasoning
    // applies — an unverified account has not shown it controls the address
    // it claims. Say so where the controls would be, rather than leaving an
    // empty section the reader has to interpret.
    const note = el(doc, 'p', 'text-sm text-muted-foreground',
      'Confirm your email address to download or erase your details. ');
    const go = el(doc, 'a', 'font-medium text-accent underline-offset-4 hover:underline', 'Confirm your email');
    go.href = '/e/verify';
    note.appendChild(go);
    slot.appendChild(note);
    return;
  }
  const panel = accountPanel(doc, {
    onExport: () => downloadExport(doc),
    onErase: async () => {
      const response = await fetch('/e/api/me/erase', {
        method: 'POST',
        headers: { accept: 'application/json', 'X-ShuttleWorks-CSRF': '1' },
      });
      if (response.ok) window.location.assign('/e/login');
    },
  });
  slot.appendChild(panel);
}

/** The page's own address, for the sign-in return: the entries list or the
 * settings page, whichever this document is. */
function selfPath() {
  return document.getElementById('my-entries-root') ? '/e/me/entries' : '/e/me/settings';
}

function fail(root, slot) {
  const copy = root
    ? 'Your entries could not be loaded. Please try again in a moment.'
    : 'Your account details could not be loaded. Please try again in a moment.';
  (root ?? slot).textContent = copy;
}

async function boot(root, slot) {
  let response;
  try {
    // The one account read this module makes. On the settings page it is
    // read for `emailVerified` alone; the list is not rendered there.
    response = await fetch('/e/api/me/entries', {
      headers: { accept: 'application/json' },
    });
  } catch {
    fail(root, slot);
    return;
  }
  if (response.status === 401) {
    // §3.1: signed-out visitors go to sign-in with a return-to. The target
    // matches the `safeNext` allowlist on both tiers.
    window.location.assign(`/e/login?next=${selfPath()}`);
    return;
  }
  if (!response.ok) {
    fail(root, slot);
    return;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    fail(root, slot);
    return;
  }
  render(root, data);
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('my-entries-root');
  const slot = document.getElementById('my-account-root');
  if (root || slot) void boot(root, slot);
}
