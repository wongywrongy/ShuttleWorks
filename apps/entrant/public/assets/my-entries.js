/**
 * My Entries (SP-P7 §3.1) — the page's one script, and the tier's first.
 *
 * **Why a plain external module and not hydration.** This tier ships no
 * client JS by construction (`app/root.tsx`: no `<Scripts/>`, and the CSP
 * has no `'unsafe-inline'` and no nonce, so React Router's inline hydration
 * bootstrap can never execute). My Entries is the first page whose DATA is
 * credentialed — node must not read the session (R8-D), so the browser has
 * to — and `script-src 'self'` already permits an external same-origin
 * module. One page, one small script, zero CSP surgery; the pattern scales
 * to the entrants filter without ever restoring inline script execution.
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

/** Quoted while awaiting, plain total after; nothing on withdrawn cards or
 * unpriced pages. Register per the mockup review, symbol-less per the tier. */
export function priceLine(card) {
  if (card.feeTotalCents === null || card.feeTotalCents === undefined) return null;
  if (card.status === 'withdrawn') return null;
  if (card.status === 'awaiting') {
    return `Quoted ${formatCents(card.feeTotalCents)} · pay at the desk`;
  }
  return `Total ${formatCents(card.feeTotalCents)}`;
}

/** A line wears its own chip only when it disagrees with the card. */
export function lineChip(cardStatus, state) {
  if (state === 'withdrawn') return 'Withdrawn';
  if (state === 'rejected') return 'Not accepted';
  if (state === 'awaiting' && cardStatus !== 'awaiting') return 'Awaiting confirmation';
  if (state === 'entered' && cardStatus === 'awaiting') return 'Entered';
  return null;
}

/** "View results" exists only where the player page answers (§4): played
 * card, published entrant pages, and a real person key to point at. */
export function resultsHref(card, line) {
  if (card.status !== 'played' || !card.entrantsPublished) return null;
  if (!card.slug || !line.personKey) return null;
  return `/e/${encodeURIComponent(card.slug)}/players/${encodeURIComponent(line.personKey)}`;
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

const CHIP_TONE_CLASS = {
  live: 'border-status-live/40 bg-status-live-bg text-status-live',
  done: 'border-status-done/40 bg-status-done-bg text-status-done',
  plain: 'border-rule-soft bg-surface-raised text-muted-foreground',
};

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function chipEl(doc, label, tone) {
  return el(
    doc,
    'span',
    `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_TONE_CLASS[tone] ?? CHIP_TONE_CLASS.plain}`,
    label,
  );
}

function cardEl(doc, card, emailVerified) {
  const article = el(
    doc,
    'article',
    'rounded-lg border border-rule-soft bg-surface-raised p-4 shadow-sm',
  );

  const head = el(doc, 'div', 'flex items-start justify-between gap-3');
  const title = el(doc, 'div', 'min-w-0');
  if (card.slug) {
    const link = el(
      doc,
      'a',
      'font-display text-base font-bold tracking-tight text-foreground underline-offset-4 hover:underline',
      card.tournamentName ?? card.slug,
    );
    link.href = `/e/${encodeURIComponent(card.slug)}`;
    title.appendChild(link);
  } else {
    title.appendChild(
      el(doc, 'p', 'font-display text-base font-bold tracking-tight text-foreground',
        card.tournamentName ?? 'Tournament'),
    );
  }
  const metaParts = [card.orgName, card.venueName, formatDate(card.date)].filter(Boolean);
  if (metaParts.length > 0) {
    title.appendChild(
      el(doc, 'p', 'mt-0.5 text-xs text-muted-foreground', metaParts.join(' · ')),
    );
  }
  head.appendChild(title);
  const chip = cardChip(card.status);
  head.appendChild(chipEl(doc, chip.label, chip.tone));
  article.appendChild(head);

  const lines = el(doc, 'ul', 'mt-3 grid gap-1.5');
  for (const line of card.events ?? []) {
    const row = el(doc, 'li', 'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm');
    row.appendChild(
      el(doc, 'span', 'text-foreground',
        `${line.eventCode} · ${line.discipline} · ${line.playerName}`),
    );
    const own = lineChip(card.status, line.state);
    if (own) {
      row.appendChild(
        el(doc, 'span', 'rounded-full border border-rule-soft px-2 py-0.5 text-xs text-muted-foreground', own),
      );
    }
    if (line.resultBadge) {
      row.appendChild(
        el(doc, 'span', 'rounded-full border border-status-done/40 bg-status-done-bg px-2 py-0.5 text-xs font-medium text-status-done', line.resultBadge),
      );
    }
    const href = resultsHref(card, line);
    if (href) {
      const view = el(
        doc,
        'a',
        'text-xs font-medium text-accent underline-offset-4 hover:underline',
        'View results',
      );
      view.href = href;
      row.appendChild(view);
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
  if (price) {
    article.appendChild(el(doc, 'p', 'mt-3 text-sm text-muted-foreground', price));
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
