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

export function formatMoment(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export function receiptStatus(status) {
  return (
    {
      confirmed: { label: "Confirmed", tone: "done" },
      submitted: { label: "Submitted", tone: "live" },
      withdrawn: { label: "Withdrawn", tone: "plain" },
    }[status] ?? { label: "Submitted", tone: "live" }
  );
}

export function paymentSummary(receipt) {
  if (receipt.paymentState === "not_required") return "No payment required";
  const amount = formatCents(receipt.feeTotalCents);
  if (receipt.paymentState === "recorded") {
    return amount ? `Payment recorded · ${amount}` : "Payment recorded";
  }
  return amount ? `Payment required · ${amount}` : "Payment required";
}

export function receiptText(receipt) {
  const lines = [
    receipt.tournamentName ?? "Tournament entry",
    `Reference: ${receipt.submissionId}`,
    `Status: ${receiptStatus(receipt.status).label}`,
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
    lines.push(
      `${event.eventCode} · ${event.discipline} · ${player}` +
        (partner ? ` with ${partner}` : "") +
        ` · ${event.state}`,
    );
  }
  if (receipt.paymentNote) lines.push(`Payment note: ${receipt.paymentNote}`);
  if (receipt.paymentInstructions) {
    lines.push("", "Payment instructions", receipt.paymentInstructions);
  }
  return `${lines.join("\n")}\n`;
}

const TONE_CLASS = {
  done: "border-status-done/40 bg-status-done-bg text-status-done",
  live: "border-status-live/40 bg-status-live-bg text-status-live",
  plain: "border-rule-soft bg-surface-raised text-muted-foreground",
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
    "rounded-lg border border-rule-soft bg-surface-raised p-5 shadow-sm",
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
  const section = card(doc, title);
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
  const summary = card(doc, "Receipt summary");
  const headingRow = el(
    doc,
    "div",
    "mt-3 flex flex-wrap items-center justify-between gap-3",
  );
  const status = receiptStatus(receipt.status);
  headingRow.appendChild(
    el(
      doc,
      "p",
      "font-display text-xl font-semibold text-foreground",
      receipt.tournamentName ?? "Tournament entry",
    ),
  );
  headingRow.appendChild(
    el(
      doc,
      "span",
      `rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[status.tone]}`,
      status.label,
    ),
  );
  summary.appendChild(headingRow);

  const facts = el(doc, "dl", "mt-4 grid gap-3 text-sm sm:grid-cols-2");
  const fact = (term, value) => {
    const wrap = el(doc, "div", "grid gap-0.5");
    wrap.appendChild(
      el(
        doc,
        "dt",
        "text-xs font-medium uppercase tracking-wide text-muted-foreground",
        term,
      ),
    );
    wrap.appendChild(el(doc, "dd", "text-foreground", value));
    facts.appendChild(wrap);
  };
  fact("Submitted", formatMoment(receipt.submittedAt) || "Recorded");
  fact("Payment", paymentSummary(receipt));
  if (receipt.venueName) fact("Venue", receipt.venueName);
  if (receipt.orgName) fact("Organizer", receipt.orgName);
  summary.appendChild(facts);

  const events = card(doc, "Events");
  const list = el(doc, "ul", "mt-3 divide-y divide-rule-soft");
  for (const event of receipt.events ?? []) {
    const item = el(doc, "li", "grid gap-1 py-3 first:pt-0 last:pb-0");
    item.appendChild(
      el(
        doc,
        "p",
        "font-medium text-foreground",
        `${event.eventCode} · ${event.discipline}`,
      ),
    );
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
      el(doc, "p", "text-xs capitalize text-muted-foreground", event.state),
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

  const nodes = [summary, events];
  if (receipt.paymentInstructions || receipt.paymentNote) {
    const payment = card(doc, "Payment and next steps");
    if (receipt.paymentNote) {
      payment.appendChild(
        el(doc, "p", "mt-2 text-sm text-foreground", receipt.paymentNote),
      );
    }
    if (receipt.paymentInstructions) {
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
    anchor.download = `shuttleworks-entry-${receipt.submissionId}.txt`;
    anchor.click();
    URL.revokeObjectURL(href);
  });
  actions.append(print, download);
  nodes.push(actions);

  root.replaceChildren(...nodes);
  root.setAttribute("aria-busy", "false");
}

export async function loadReceipt(root, fetchImpl = fetch) {
  const submissionId = root.dataset.submissionId;
  const slug = root.dataset.slug;
  if (!submissionId) return;
  try {
    const response = await fetchImpl(
      `/e/api/me/submissions/${encodeURIComponent(submissionId)}`,
      {
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401) {
      const next = `/e/${encodeURIComponent(slug ?? "")}/receipt/${encodeURIComponent(submissionId)}`;
      renderMessage(
        root,
        "Sign in to view the full receipt",
        "The reference is safe. Sign in with the account that submitted this entry to see its events, partner, fee, and payment state.",
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
