/**
 * Account-scoped receipt enhancement.
 *
 * The server-rendered route intentionally knows only public tournament data.
 * This external module runs in the credential-holding browser and loads the
 * receipt through `/e/api/me`. Entrant-authored values are always assigned via
 * `textContent`; no HTML strings are assembled.
 */

import { createPersonRef, personRefModel } from "./person-ref.js";

export function formatCents(cents) {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}

/**
 * An amount with the organizer's currency where they stated one
 * (`GBP 55.00`), and the bare figure plus a plain "currency not stated"
 * where they did not (public refinement 2026-09-12). Mirrors
 * `app/lib/money.ts`'s `formatMoney`; no symbol is ever invented.
 */
export function formatMoney(cents, currency) {
  const figure = formatCents(cents);
  if (figure === "") return "";
  const code = (currency ?? "").trim().toUpperCase();
  return code === "" ? `${figure} (currency not stated)` : `${code} ${figure}`;
}

export function formatMoment(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

/**
 * The ENTRY state, and only the entry state (P8/D8).
 *
 * "Entry received" rather than "Submitted": submission is a thing the
 * entrant did, and what they need told back is where the entry now stands.
 * "Entry confirmed" is reserved for the case the backend actually reports
 * as confirmed, every line entered, so approval that is still outstanding
 * never reads as approval that arrived. Payment and partner are separate
 * facts and are NOT folded into this one word.
 */
export function receiptStatus(status) {
  return (
    {
      confirmed: { label: "Entry confirmed", tone: "done" },
      submitted: { label: "Entry received", tone: "live" },
      withdrawn: { label: "Withdrawn", tone: "plain" },
    }[status] ?? { label: "Entry received", tone: "live" }
  );
}

/**
 * The PAYMENT state, as the backend actually reports it (P8/D8).
 *
 * "Payment required" told the entrant nothing they could act on. The three
 * states the receipt endpoint can emit each get the plain fact instead:
 * nothing owed, an amount recorded as paid, or an amount still due. There
 * is no currency field in the schema, so there is no symbol here either
 * (`app/lib/money.ts` argues that at length). No Pay now action is offered
 * because no payment flow exists to send anyone to.
 */
export function paymentSummary(receipt) {
  if (receipt.paymentState === "not_required") return "No payment due";
  const amount = formatMoney(receipt.feeTotalCents, receipt.feeCurrency);
  if (receipt.paymentState === "recorded") {
    return amount ? `Paid ${amount}` : "Paid";
  }
  return amount ? `Amount due ${amount}` : "Amount due";
}

/**
 * One event line's state, in the same words My entries uses (P8/D8).
 *
 * A bare capitalised "Awaiting" named nothing that was pending. The wire
 * vocabulary (`entries_me.py::_entry_state`) folds pending, waitlisted and
 * unverified into one `awaiting`, so it cannot tell an outstanding partner
 * invitation from an outstanding organizer decision, and this therefore
 * does not claim to. "Awaiting confirmation" is the honest ceiling.
 */
export function lineState(state) {
  return (
    {
      awaiting: "Awaiting confirmation",
      entered: "Entered",
      withdrawn: "Withdrawn",
      rejected: "Not accepted",
    }[state] ?? "Awaiting confirmation"
  );
}

export function receiptText(receipt) {
  const lines = [
    receipt.tournamentName ?? "Tournament entry",
    `Reference: ${receipt.shortReference}`,
    `Entry: ${receiptStatus(receipt.status).label}`,
    `Submitted: ${formatMoment(receipt.submittedAt) || receipt.submittedAt}`,
    `Payment: ${paymentSummary(receipt)}`,
  ];
  for (const event of receipt.events ?? []) {
    const player = personRefModel({
      slug: receipt.slug ?? "",
      identity: event.player?.identity ?? null,
      state: event.player?.resolution ?? "dead",
      label: event.player?.label ?? "Player",
    }).text;
    const partner = event.partner
      ? personRefModel({
          slug: receipt.slug ?? "",
          identity: event.partner.identity ?? null,
          state: event.partner.resolution ?? "dead",
          label: event.partner.label,
        }).text
      : null;
    // D1: no application-authored middle dots. The saved copy is a plain
    // text document; fields are separated by spacing and a second line.
    lines.push(
      `${event.eventCode} ${event.discipline}, ${player}` +
        (partner ? ` with ${partner}` : "") +
        ` (${lineState(event.state)})`,
    );
  }
  lines.push(`Recorded: ${receipt.paidCents ?? 0} cents`);
  if (receipt.outstandingCents != null) lines.push(`Outstanding: ${receipt.outstandingCents} cents`);
  if (receipt.paymentInstructions) {
    lines.push("", "Payment instructions", receipt.paymentInstructions);
  }
  return `${lines.join("\n")}\n`;
}

/** A state reads as a plain weighted word in its tone (ADR 0027: no pill,
 * no dot), the same vocabulary My entries uses, so the two surfaces cannot
 * describe the same entry in two different registers. */
const STATUS_TEXT_CLASS = {
  done: "font-medium text-status-done",
  live: "font-medium text-status-live",
  plain: "font-medium text-muted-foreground",
};

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function card(doc, title) {
  const section = el(
    doc,
    "section",
    "rounded-lg border border-rule-soft bg-surface-raised p-4 md:p-6",
  );
  section.appendChild(
    el(
      doc,
      "h2",
      "font-display text-lg font-semibold tracking-tight text-foreground",
      title,
    ),
  );
  return section;
}

function actionLink(doc, href, label, primary = false) {
  const link = el(
    doc,
    "a",
    primary
      ? "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
      : "inline-flex min-h-11 items-center justify-center rounded-md border border-rule-soft px-4 py-2 text-sm font-semibold text-foreground",
    label,
  );
  link.href = href;
  return link;
}

function renderMessage(root, title, body, action) {
  const doc = root.ownerDocument;
  const pageTitle = doc.getElementById("receipt-title");
  if (pageTitle) pageTitle.textContent = title;
  // The page title is the single primary heading. The settled panel gets a
  // neutral section label so it cannot duplicate that heading (PE39.1/.2).
  const intro = doc.getElementById("receipt-intro");
  if (intro) intro.remove();
  const section = card(doc, "Account access");
  section.appendChild(el(doc, "p", "mt-2 text-sm text-muted-foreground", body));
  if (action) {
    const row = el(doc, "div", "mt-4 flex flex-wrap gap-2");
    row.appendChild(actionLink(doc, action.href, action.label, true));
    section.appendChild(row);
  }
  root.replaceChildren(section);
  root.setAttribute("aria-busy", "false");
}

export function renderReceipt(root, receipt) {
  const doc = root.ownerDocument;
  const pageTitle = doc.getElementById("receipt-title");
  if (pageTitle) pageTitle.textContent = "Entry received";
  const intro = doc.getElementById("receipt-intro");
  if (intro) intro.remove();
  // P8/D8: ONE summary. The tournament name and the reference are stated by
  // the page header (`routes/receipt.tsx`) and are deliberately not repeated
  // here, nor is the second "Copy reference" button that used to sit in
  // this card. Entry, payment and partner are three separate facts rather
  // than one green badge that spoke for all three.
  const summary = card(doc, "Entry status");
  const status = receiptStatus(receipt.status);

  const facts = el(doc, "dl", "mt-4 grid gap-3 text-sm sm:grid-cols-2");
  const fact = (term, value, valueClass = "text-foreground") => {
    const wrap = el(doc, "div", "grid gap-0.5");
    wrap.appendChild(
      el(
        doc,
        "dt",
        "text-xs font-medium uppercase tracking-wide text-muted-foreground",
        term,
      ),
    );
    wrap.appendChild(el(doc, "dd", valueClass, value));
    facts.appendChild(wrap);
  };
  fact("Entry", status.label, STATUS_TEXT_CLASS[status.tone]);
  fact("Payment", paymentSummary(receipt));
  fact("Submitted", formatMoment(receipt.submittedAt) || "Recorded");
  // Partner state is stated only where the record actually distinguishes it:
  // an ACCEPTED partner is a fact this projection carries. "Awaiting partner"
  // is not, the receipt cannot tell a singles line from a doubles line whose
  // invitation is outstanding, so it is not claimed here.
  const partnerNames = [
    ...new Set(
      (receipt.events ?? [])
        .map((event) => event.partner ? personRefModel({ slug: receipt.slug ?? "", ...event.partner, state: event.partner.resolution }).text : null)
        .filter(Boolean),
    ),
  ];
  if (partnerNames.length > 0) {
    fact("Partner accepted", partnerNames.join(", "));
  }
  if (receipt.venueName) fact("Venue", receipt.venueName);
  // The local simulator's bootstrap label is an implementation fallback,
  // not organizer information an entrant can act on. Keep receipt details
  // consistent with the tournament frame, which suppresses it as well.
  if (receipt.orgName && receipt.orgName !== "Local Workspace") {
    fact("Organizer", receipt.orgName);
  }
  summary.appendChild(facts);

  // P8/D8 + refinement 2026-09-12: the events are the same record as the
  // status above them, so they sit in the SAME card under one rule rather
  // than in a second container repeating the card chrome.
  const events = el(doc, "div", "mt-4 border-t border-rule-soft pt-3");
  events.appendChild(
    el(doc, "h3", "text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground", "Events"),
  );
  const list = el(doc, "ul", "mt-2 divide-y divide-rule-soft");
  for (const event of receipt.events ?? []) {
    const item = el(
      doc,
      "li",
      "flex flex-wrap items-baseline justify-between gap-4 py-2 text-sm text-foreground first:pt-0 last:pb-0",
    );
    // D1: two fields, not one middle-dot string.
    const naming = el(doc, "p", "flex flex-wrap items-baseline gap-2");
    naming.appendChild(
      el(doc, "span", "font-medium text-foreground", event.eventCode),
    );
    naming.appendChild(
      el(doc, "span", "text-muted-foreground", event.discipline),
    );
    item.appendChild(naming);
    const people = el(doc, "p", "flex flex-wrap items-baseline gap-1.5 text-sm");
    people.appendChild(createPersonRef(doc, {
      slug: receipt.slug ?? "",
      identity: event.player?.identity ?? null,
      state: event.player?.resolution ?? "dead",
      label: event.player?.label ?? "Player",
    }));
    if (event.partner) {
      people.appendChild(el(doc, "span", "text-muted-foreground", "with"));
      people.appendChild(createPersonRef(doc, {
        slug: receipt.slug ?? "",
        identity: event.partner.identity ?? null,
        state: event.partner.resolution ?? "dead",
        label: event.partner.label ?? "Partner",
      }));
    }
    item.appendChild(people);
    item.appendChild(
      el(doc, "p", "text-xs text-muted-foreground", lineState(event.state)),
    );
    list.appendChild(item);
  }
  if (!receipt.events?.length) {
    list.appendChild(
      el(
        doc,
        "li",
        "py-2 text-sm text-muted-foreground",
        "No event lines were recorded.",
      ),
    );
  }
  events.appendChild(list);
  const total = formatMoney(receipt.feeTotalCents, receipt.feeCurrency);
  if (total) {
    const totalRow = el(
      doc,
      "p",
      "mt-3 flex flex-wrap items-baseline justify-between gap-4 border-t border-rule-soft pt-3 text-sm text-foreground",
    );
    totalRow.appendChild(el(doc, "span", "font-semibold", "Total"));
    totalRow.appendChild(
      el(doc, "span", "text-lg font-semibold tabular-nums text-foreground", total),
    );
    events.appendChild(totalRow);
  }
  summary.appendChild(events);

  const nodes = [summary];
  // P8/D8: the organizer's payment instructions are how an amount that is
  // still due gets settled, pay at check-in, a transfer, whatever they
  // configured, so they appear exactly once, and only while something is
  // actually owed. Repeating them on a receipt whose payment is recorded (or
  // where none was due) is the "Payment required" noise this package removed.
  // No Pay now button: no payment flow exists to send anyone to.
  const showInstructions =
    receipt.paymentInstructions && receipt.paymentState === "required";
  if (showInstructions) {
    const payment = card(doc, "How to pay");
    if (showInstructions) {
      payment.appendChild(
        el(
          doc,
          "p",
          "mt-2 whitespace-pre-line text-sm text-muted-foreground",
          receipt.paymentInstructions,
        ),
      );
    }
    nodes.push(payment);
  }

  const actions = el(doc, "div", "flex flex-wrap gap-2 print:hidden");
  const print = el(
    doc,
    "button",
    "inline-flex min-h-11 items-center rounded-md border border-rule-soft px-4 py-2 text-sm font-semibold text-foreground",
    "Print receipt",
  );
  print.type = "button";
  print.addEventListener("click", () => doc.defaultView?.print());
  const download = el(
    doc,
    "button",
    "inline-flex min-h-11 items-center rounded-md border border-rule-soft px-4 py-2 text-sm font-semibold text-foreground",
    "Download receipt",
  );
  download.type = "button";
  download.addEventListener("click", () => {
    const blob = new Blob([receiptText(receipt)], {
      type: "text/plain;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const anchor = doc.createElement("a");
    anchor.href = href;
    anchor.download = `shuttleworks-entry-${receipt.shortReference}.txt`;
    anchor.click();
    URL.revokeObjectURL(href);
  });
  actions.append(print, download);
  nodes.push(actions);

  root.replaceChildren(...nodes);
  root.setAttribute("aria-busy", "false");
}

async function copyReference(button, value) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Reference copied";
  } catch {
    button.textContent = "Copy unavailable, quote the full reference above";
  }
}

for (const button of document.querySelectorAll("[data-copy-reference]")) {
  button.addEventListener("click", () => copyReference(button, button.dataset.copyReference ?? ""));
}

export async function loadReceipt(root, fetchImpl = fetch) {
  // V3-24-1: the page's handle on this act is its short reference, the
  // same string in the address bar, in the "Reference" line above, and in
  // the account-scoped request below. There is one identifier on this
  // screen, and the entrant can read it.
  const reference = root.dataset.reference;
  const slug = root.dataset.slug;
  if (!reference) return;
  try {
    const response = await fetchImpl(
      `/e/api/me/submissions/${encodeURIComponent(reference)}`,
      {
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401) {
      const next = `/e/${encodeURIComponent(slug ?? "")}/receipt/${encodeURIComponent(reference)}`;
      renderMessage(
        root,
        "Sign in to view the full receipt",
        // V3-PE39.1: no unverifiable safety claim ("the reference is safe"
        // has no user-actionable meaning); state the one thing that is
        // true and actionable instead.
        "Sign in with the account used for this entry to view its details and payment status.",
        {
          href: `/e/login?next=${encodeURIComponent(next)}`,
          label: "Sign in and return",
        },
      );
      return;
    }
    if (response.status === 404) {
      renderMessage(
        root,
        "Receipt details are not available for this account",
        "Switch accounts if someone else submitted the entry. The entry has not been changed or resubmitted.",
        { href: "/e/me/entries", label: "See my entries" },
      );
      return;
    }
    if (!response.ok)
      throw new Error(`Receipt request failed (${response.status})`);
    renderReceipt(root, await response.json());
    if (slug) {
      try {
        window.sessionStorage.removeItem(`shuttleworks:entry-draft:${slug}`);
      } catch {
        // Storage may be disabled; the receipt itself is already rendered.
      }
    }
  } catch (_error) {
    renderMessage(
      root,
      "Receipt details could not be loaded",
      "Your submitted entry is unchanged. Check your connection and try this page again; do not submit another entry.",
      { href: root.ownerDocument.location.href, label: "Try again" },
    );
  }
}

const mount =
  typeof document === "undefined"
    ? null
    : document.getElementById("receipt-details-root");
if (mount) loadReceipt(mount);
