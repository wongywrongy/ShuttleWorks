# v3 consolidated plan — runtime findings (work package 27b)

Per plan §7 / closure.md's recapture instructions: observations made *during* the 27b
recapture that are not one-line product fixes (those were fixed in place — none were
needed this slice) and are not already covered by an existing `V3-` finding. Recorded
here with `V3-RT-n` ids and mirrored as short entries in `docs/reference/debt-log.md`
("Work package 27b").

## V3-RT-1 — stale `console-a11y.spec.ts` locator on Setup › Dates

**Observed:** running `tests/e2e/run-console-contracts.sh` against a fresh package-01
fixture, `console-browser-contracts.spec.ts` passed 7/7, but `console-a11y.spec.ts`
failed 3 of 23:

- `at 1024px › Setup › Dates: DOM audit + keyboard walk`
- `at 1440px › Setup › Dates: DOM audit + keyboard walk`
- `Save bar dirty/clean states are announced via role=status or aria-live (Setup › Dates)`

All three time out (15s) waiting for `page.getByTestId('setup-strip')` to become visible.

**Diagnosis — stale expectation, not a product defect.** `SetupProduct.tsx` renders
`data-testid="setup-strip"` only when the selected section's `status` is neither `ready`
nor `complete` (a deliberate rule pinned by `SetupProduct.test.tsx`'s "does not repeat a
healthy section status beside the editor" — a healthy section should not repeat its own
status beside the editor). Querying the live fixture directly confirms Taipei's `dates`
section is now `ready`:

```
$ curl -s http://127.0.0.1:8600/tournaments/<taipeiTid>/setup | python3 -m json.tool | grep -A3 '"key": "dates"'
"key": "dates",
"status": "ready",
"summary": "Ready",
```

So the strip correctly does not render, and the spec's `ready: (p) => p.getByTestId('setup-strip')`
locator for the "Setup › Dates" surface is stale against the fixture's current (fully
configured, live) state. This is unrelated to the two stale expectations already fixed in
`05f93392` (Venue board link label; Korea readiness timezone) — it surfaced after those
fixes, once Taipei's setup state itself became fully "ready" end-to-end.

**Impact:** none on product correctness. `console-browser-contracts.spec.ts` (P0 gate,
7/7) is unaffected; the other 20 `console-a11y.spec.ts` assertions (P1) pass. No P0 or P1
flow is unverified as a result — Setup › Dates' actual accessibility properties (labels,
focus, live region) were still exercised by `SetupProduct.test.tsx`'s component-level
tests, just not by this one browser-level surface visit.

**Smallest fix (out of this package's file scope — `console-a11y.spec.ts` is not on the
editable-files list for 27b):** point the three assertions' `ready` locator at something
present on the Setup › Dates page regardless of section status (e.g.
`page.getByLabel('Tournament starts')`, which is a labeled field always rendered when
`setup`/`selected` have loaded), or seed a fixture variant that keeps `dates` genuinely
blocked for this one spec. Logged as `V3-RT-1` / debt-log "Work package 27b".

## V3-RT-2 — "Operator sign-in" evidence gap cannot be captured in `AUTH_MODE=local`

**Observed:** plan §7 / closure.md section (b) names "Operator sign-in" as evidence still
to obtain: "`/` → sign-in form → successful sign-in → workspace hub". Driving this
through the browser against the package-01 fixture found no sign-in form to fill in:

```
GET http://127.0.0.1:4173/login  →  redirects to  http://127.0.0.1:4173/
```

**Diagnosis.** `tools/fixture-up.sh` runs `AUTH_MODE=local` (line 95), and CLAUDE.md
documents the resulting behavior exactly: "`AUTH_MODE=local` (default) resolves
credential-less requests to the zero-UUID bootstrap operator — the solo flow stays
zero-friction and offline." There is no operator sign-in boundary to click through in
this mode by design; visiting `/login` while already resolved to the bootstrap operator
redirects straight past it. The only operator-tier authentication this whole v3 program
exercises anywhere is API-level: `console-browser-contracts.spec.ts`'s "the API-created
Taipei viewer sees live data but cannot issue writes" test logs in via
`page.request.post("/api/auth/login", ...)`, never the UI form — because the viewer
account is a real, non-bootstrap identity even under `AUTH_MODE=local`.

**Captured instead:** `docs/screenshots/ui-review/v3-recapture/journeys/OC01-signin-form@1440.png`
— what `/login` actually renders in this fixture (the Hub, reached with no form), which is
the honest "successful outcome" of visiting that route in local mode, not a sign-in form
mid-flow.

**Impact:** this is a genuine capture gap against plan §7's literal wording, not a product
defect — the zero-friction bootstrap behavior is the documented, intended local-mode
design. Closing the gap as originally worded needs either a fixture variant that boots
`AUTH_MODE=cloud` (a materially different, heavier fixture — real org/user rows, a
real password, CSRF-protected login POST) purely to exercise a UI form that local mode
correctly bypasses, or a revision to plan §7's wording acknowledging that "operator
sign-in" is a non-event under the product's own zero-friction design and that the
existing API-level viewer-login test is the correct-altitude evidence for cloud-mode
credential auth. Logged as `V3-RT-2` / debt-log "Work package 27b"; recommend the plan
wording be revisited rather than treating this as an open implementation task.

## No other runtime findings

Every other automated gate run during this recapture (fixture defects a–g, the ten
account-journey checks, `console-browser-contracts.spec.ts` 7/7, `entrant-a11y.spec.ts`
88/88 — one test needed an isolated re-run after a full-suite dev-server contention
timeout, see `reports/27b-recapture.md`) passed clean, and the sampled visual review
(all 5 PE35–39 findings, OC24 signage, OC31 readiness checklist, and the 7 supplementary
successful-journey captures — see `reports/27b-recapture.md` "Visual review scope") found
no regression against any finding's documented treatment.
