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

import { createPersonRef } from './person-ref.js';

// ---- pure decisions -------------------------------------------------------

/** Cents → "55.00"; null → "" (mirrors app/lib/money.ts — no symbol: no
 * currency field exists, and inventing one would be a lie with a $ on it). */
export function formatCents(cents) {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
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

/** The §3.1 chip per card status: label + the tier's tone vocabulary. */
export function cardChip(status) {
  return (
    {
      awaiting: { label: 'Awaiting confirmation', tone: 'plain' },
      entered: { label: 'Entered', tone: 'live' },
      played: { label: 'Played', tone: 'done' },
      withdrawn: { label: 'Withdrawn', tone: 'plain' },
    }[status] ?? { label: 'Awaiting confirmation', tone: 'plain' }
  );
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
 * E2: a still-open withdrawal deadline is appended with the tier's own
 * middle-dot separator. */
export function priceLine(card) {
  if (card.feeTotalCents === null || card.feeTotalCents === undefined) return null;
  if (card.status === 'withdrawn') return null;
  const deadline = formatWithdrawDeadline(card.withdrawsUntil);
  const suffix = deadline ? ` · withdrawal open until ${deadline}` : '';
  if (card.status === 'awaiting') {
    return `Quoted ${formatCents(card.feeTotalCents)} · pay at the desk${suffix}`;
  }
  return `Total ${formatCents(card.feeTotalCents)}${suffix}`;
}

/** A line wears its own chip only when it disagrees with the card. */
export function lineChip(cardStatus, state) {
  if (state === 'withdrawn') return 'Withdrawn';
  if (state === 'rejected') return 'Not accepted';
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
  if (card.status !== 'played' || !card.entrantsPublished) return null;
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
 * - otherwise -> the two actions, withdraw and withdraw-and-erase.
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
  const metaParts = [card.orgName, card.venueName, formatDate(card.date)].filter(Boolean);
  if (metaParts.length > 0) {
    title.appendChild(
      el(doc, 'p', 'mt-0.5 text-sm text-muted-foreground', metaParts.join(' · ')),
    );
  }
  head.appendChild(title);
  const status = cardChip(card.status);
  head.appendChild(statusEl(doc, status.label, status.tone));
  article.appendChild(head);

  // One card holds every line this account submitted for the tournament,
  // which can be several people (a parent entering two children). The
  // footer carries the "View results" link when the card resolves to ONE
  // player page; with several distinct pages each line keeps its own link,
  // because a footer with two identical labels would name nobody.
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
    const lead = el(doc, 'span', 'min-w-0');
    lead.appendChild(el(doc, 'span', 'font-medium', line.eventCode));
    lead.appendChild(el(doc, 'span', 'text-muted-foreground', ` · ${line.discipline} · `));
    row.appendChild(lead);
    lead.appendChild(createPersonRef(doc, {
      slug: card.slug ?? '',
      identity: line.player?.identity ?? null,
      state: line.player?.resolution ?? 'dead',
      label: line.player?.label ?? 'Player',
      className: 'font-medium',
    }));
    if (line.partner) {
      lead.appendChild(el(doc, 'span', 'text-muted-foreground', ' with '));
      lead.appendChild(createPersonRef(doc, {
        slug: card.slug ?? '',
        identity: line.partner.identity ?? null,
        state: line.partner.resolution ?? 'dead',
        label: line.partner.label ?? 'Partner',
      }));
    }
    const own = lineChip(card.status, line.state);
    if (own) {
      row.appendChild(
        el(doc, 'span', `${CHIP} border-rule-control text-muted-foreground`, own),
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
    if (line.resultBadge) {
      row.appendChild(
        el(doc, 'span', `${CHIP} border-status-done text-status-done`, line.resultBadge),
      );
    }
    // V3-24-1: a card folds every act this account made against one
    // tournament, and the footer can only name one of them. A line from an
    // OLDER act says so, because "quote your reference" is useless advice
    // when the entrant holds two and the page shows one. A line from the
    // card's own act stays silent — repeating the footer on every row is
    // noise, not information.
    if (line.shortReference && line.shortReference !== card.shortReference) {
      row.appendChild(
        el(
          doc,
          'span',
          'text-xs text-muted-foreground',
          `Reference ${line.shortReference}`,
        ),
      );
    }
    const href = resultsHref(card, line);
    if (href && !footerHref) {
      row.appendChild(resultsLink(doc, href));
    }
    const affordance = withdrawAffordance(line, emailVerified);
    if (affordance?.kind === 'reason') {
      row.appendChild(
        el(doc, 'span', 'text-xs text-muted-foreground', affordance.text),
      );
    } else if (affordance?.kind === 'actions') {
      row.appendChild(withdrawControls(doc, affordance.entryId, row));
    }
    lines.appendChild(row);
  }
  article.appendChild(lines);

  const price = priceLine(card);
  const receiptHrefValue = receiptHref(card);
  if (price || footerHref || receiptHrefValue || card.shortReference) {
    const footer = el(
      doc,
      'footer',
      'flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft px-6 py-3 text-xs text-muted-foreground',
    );
    if (price) footer.appendChild(el(doc, 'span', undefined, price));
    // V3-24-1: the entrant's own handle on this entry, on the surface they
    // reach for before the receipt. It is the same string the receipt page
    // prints and the same one in the receipt link beside it.
    if (card.shortReference) {
      footer.appendChild(
        el(doc, 'span', 'tabular-nums', `Reference ${card.shortReference}`),
      );
    }
    const links = el(doc, 'span', 'flex items-center gap-3');
    if (receiptHrefValue) links.appendChild(receiptLink(doc, receiptHrefValue));
    if (footerHref) links.appendChild(resultsLink(doc, footerHref));
    if (links.childNodes.length > 0) footer.appendChild(links);
    article.appendChild(footer);
  }
  return article;
}

/**
 * The two-click arm for an irreversible act (E2).
 *
 * **`window.confirm` is banned product-wide** — the 2026-07-11 interaction
 * audit removed the last call site, because a native modal blocks the whole
 * event loop and, in an automated browser, silently deadlocks the page. The
 * replacement everywhere else is the same shape as this: the first press
 * ARMS and states exactly what is about to happen, the second press does it,
 * and Cancel is always the wider target.
 *
 * Withdraw and erase are separate armed actions rather than a button with a
 * checkbox: they have different consequences, and a tickbox next to a
 * destructive button is read after the click at least as often as before it.
 */
function withdrawControls(doc, entryId, row) {
  const wrap = el(doc, 'span', 'ml-auto flex items-center gap-2');
  const linkClass =
    'text-xs font-medium text-muted-foreground underline-offset-4 hover:underline';

  const arm = (label, prompt, erase) => {
    const button = el(doc, 'button', linkClass, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      wrap.textContent = '';
      wrap.appendChild(el(doc, 'span', 'text-xs text-muted-foreground', prompt));

      const go = el(
        doc,
        'button',
        'text-xs font-medium text-status-attention underline-offset-4 hover:underline',
        erase ? 'Withdraw and erase' : 'Withdraw',
      );
      go.type = 'button';
      go.addEventListener('click', () => {
        go.disabled = true;
        void submitWithdraw(doc, entryId, erase, row, wrap);
      });

      const cancel = el(doc, 'button', linkClass, 'Keep it');
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        wrap.textContent = '';
        build();
      });

      wrap.appendChild(go);
      wrap.appendChild(cancel);
    });
    return button;
  };

  function build() {
    wrap.appendChild(arm('Withdraw', 'Withdraw this entry?', false));
    wrap.appendChild(
      arm(
        'Withdraw and erase',
        'Withdraw and erase this player’s details? This cannot be undone.',
        true,
      ),
    );
  }
  build();
  return wrap;
}

/**
 * POST the withdrawal and rewrite the row in place.
 *
 * Carries `X-ShuttleWorks-CSRF` because the middleware requires it of every
 * cookie-carrying write; a native form could not send it, which is why this
 * one control on this one already-scripted page is a fetch rather than the
 * `<form>` every other entrant write uses.
 *
 * The row is rewritten from the ANSWER, not optimistically: a 409 (somebody
 * else moved it, the deadline passed while the page sat open) has to read as
 * "that did not happen", and an optimistic update would have already said it
 * did.
 */
async function submitWithdraw(doc, entryId, erase, row, wrap) {
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
      el(doc, 'span', 'text-xs text-status-attention', 'Could not reach the server. Try again.'),
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
    wrap.appendChild(el(doc, 'span', 'text-xs text-status-attention', message));
    return;
  }
  wrap.textContent = '';
  wrap.appendChild(
    el(doc, 'span', 'text-xs text-muted-foreground', erase ? 'Withdrawn and erased' : 'Withdrawn'),
  );
  row.classList.add('opacity-60');
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
    el(doc, 'h2', 'font-display text-base font-bold tracking-tight text-foreground', 'Your account'),
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
  const doc = root.ownerDocument;
  root.textContent = '';
  const cards = data?.tournaments ?? [];
  if (cards.length === 0) {
    root.appendChild(
      el(doc, 'p', 'text-muted-foreground',
        'No entries yet. When you enter a tournament, it appears here.'),
    );
    return;
  }
  if (data?.emailVerified === true) {
    // Only for a verified account: both rights are irreversible or
    // disclosing, and E2's reasoning applies — an unverified account has
    // not shown it controls the address it claims.
    root.appendChild(
      accountPanel(doc, {
        onExport: () => downloadExport(doc),
        onErase: async () => {
          const response = await fetch('/e/api/me/erase', {
            method: 'POST',
            headers: { accept: 'application/json', 'X-ShuttleWorks-CSRF': '1' },
          });
          if (response.ok) window.location.assign('/e/login');
        },
      }),
    );
  }
  for (const group of yearGroups(cards)) {
    const section = el(doc, 'section', 'grid gap-3');
    section.appendChild(
      el(doc, 'h2', 'mt-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground',
        group.year),
    );
    for (const card of group.cards) {
      section.appendChild(cardEl(doc, card, data?.emailVerified === true));
    }
    root.appendChild(section);
  }
}

async function boot(root) {
  let response;
  try {
    response = await fetch('/e/api/me/entries', {
      headers: { accept: 'application/json' },
    });
  } catch {
    root.textContent = 'Your entries could not be loaded. Please try again in a moment.';
    return;
  }
  if (response.status === 401) {
    // §3.1: signed-out visitors go to sign-in with a return-to. The target
    // matches the `safeNext` allowlist on both tiers.
    window.location.assign('/e/login?next=/e/me/entries');
    return;
  }
  if (!response.ok) {
    root.textContent = 'Your entries could not be loaded. Please try again in a moment.';
    return;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    root.textContent = 'Your entries could not be loaded. Please try again in a moment.';
    return;
  }
  render(root, data);
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('my-entries-root');
  if (root) void boot(root);
}
