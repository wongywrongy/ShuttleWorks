// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type { SubmissionReceipt } from "../public/assets/receipt.js";
import {
  loadReceipt,
  paymentSummary,
  receiptStatus,
  receiptText,
  renderReceipt,
} from "../public/assets/receipt.js";

function receipt(over: Partial<SubmissionReceipt> = {}): SubmissionReceipt {
  return {
    submissionId: "44444444-4444-4444-8444-444444444444",
    slug: "spring-open",
    tournamentName: "Spring Open",
    orgName: "Kingsway BC",
    venueName: "Kingsway Centre",
    submittedAt: "2026-08-29T10:00:00Z",
    status: "submitted",
    feeTotalCents: 5500,
    paymentState: "required",
    paymentNote: null,
    paymentInstructions: "Bank transfer on the day.",
    events: [
      {
        eventCode: "XD",
        discipline: "Mixed Doubles",
        player: {
          identity: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Ada Chen" },
          resolution: "resolved",
          label: null,
        },
        partner: {
          identity: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Sam Ali" },
          resolution: "resolved",
          label: null,
        },
        state: "awaiting",
      },
    ],
    ...over,
  };
}

function mount() {
  const root = document.createElement("section");
  root.dataset.submissionId = "44444444-4444-4444-8444-444444444444";
  root.dataset.slug = "spring-open";
  document.body.appendChild(root);
  return root;
}

describe("receipt decisions", () => {
  it("reports transaction and external payment states without inventing a currency", () => {
    expect(receiptStatus("confirmed")).toEqual({
      label: "Confirmed",
      tone: "done",
    });
    expect(paymentSummary(receipt())).toBe("Payment required · 55.00");
    expect(paymentSummary(receipt({ paymentState: "recorded" }))).toBe(
      "Payment recorded · 55.00",
    );
    expect(paymentSummary(receipt({ paymentState: "not_required" }))).toBe(
      "No payment required",
    );
  });

  it("builds a complete downloadable text receipt", () => {
    const text = receiptText(receipt());
    expect(text).toContain("Reference: 44444444-4444-4444-8444-444444444444");
    expect(text).toContain(
      "XD · Mixed Doubles · Ada Chen with Sam Ali · awaiting",
    );
    expect(text).toContain("Payment instructions\nBank transfer on the day.");
  });
});

describe("receipt DOM", () => {
  it("renders the complete account-scoped summary and never interprets authored markup", () => {
    const root = mount();
    renderReceipt(
      root,
      receipt({
        tournamentName: "<img src=x onerror=alert(1)>",
        events: [
          {
            eventCode: "MS",
            discipline: "Men's Singles",
            player: {
              identity: { id: null, name: "<script>alert(2)</script>" },
              resolution: "dead",
              label: null,
            },
            state: "entered",
          },
        ],
      }),
    );

    expect(root.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(root.textContent).toContain("<script>alert(2)</script>");
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect(root.textContent).toContain("Payment required · 55.00");
    expect(
      [...root.querySelectorAll("button")].map((node) => node.textContent),
    ).toEqual(["Print receipt", "Download receipt"]);
  });

  it("turns 401 into a context-preserving sign-in action", async () => {
    const root = mount();
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    await loadReceipt(root, fetchImpl);

    const link = root.querySelector("a");
    expect(root.textContent).toContain("Sign in to view the full receipt");
    expect(link?.getAttribute("href")).toContain("/e/login?next=");
    expect(decodeURIComponent(link?.getAttribute("href") ?? "")).toContain(
      "/e/spring-open/receipt/44444444-4444-4444-8444-444444444444",
    );
  });

  it("states that saved data is safe during a service failure", async () => {
    const root = mount();
    await loadReceipt(
      root,
      vi.fn(async () => new Response("", { status: 503 })),
    );
    expect(root.textContent).toContain("Your submitted entry is unchanged");
    expect(root.textContent).toContain("do not submit another entry");
  });
});
