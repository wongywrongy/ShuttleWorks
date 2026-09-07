# Ledger — package 22 (finish regulations and closed-entry pages)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## C1 — Regulations reader link labels and source (ruling R1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `regulations.tsx` sidebar link 1 | `/e/{slug}/regulations` sidebar | n/a | "Tournament overview" | change | "Overview" | Matches `TabBar`'s own label for the same destination (`components/TabBar.tsx` `TAB_LABELS.overview`) | V3-PE15.2 | `TabBar.tsx:18` |
| `regulations.tsx` sidebar link 2 | same | n/a | "View events" | change | "Draws" | Matches `TabBar`'s "Draws" label — the tab this link actually opens (`?tab=draws`) | V3-PE15.2 | `TabBar.tsx:19` |
| `regulations.tsx` sidebar link 3 | same | n/a | "View entrants" | change | "Players" | Matches `TabBar`'s "Players" label — the tab this link actually opens (`?tab=players`) | V3-PE15.2 | `TabBar.tsx:20` |
| `regulations.tsx` footer provenance paragraph | same | n/a | "Source: this document is published by the tournament organizer through {product}. Organizer: {name}. Contact details are not published on this page." | cut | (removed) | Duplicate of the "Organizer-published document" eyebrow + the Organizer row already in the document header `dl`; the contact-details disclaimer belongs nowhere on a public page (nothing there ever offered contact details to begin with) | V3-PE15.2 | `regulations.tsx` header `dl` already states the organizer once |
| `regulations.tsx` organizer-body source citation (e.g. demo historical text: "Source reference: https://en.wikipedia.org/wiki/...") | organizer-authored regulations body | a section ends in a bare `Source[ reference]: <url>.` citation | raw URL rendered as plain text | change (presentation only — content not touched) | Same sentence, same words; the URL becomes `<a href="...">` with a label derived from the URL itself (e.g. "2026 BWF World Tour") | R1: content is not rewritten, only how a citation already ending in a URL is presented | V3-PE15.2 | `renderBody`/`SOURCE_URL_RE` in `regulations.tsx`; `regulations.render.test.ts` "turns an organizer-authored source citation into a readable link, verbatim otherwise" |

## C2 — Reporting-time rule (ruling R2) — conditional, no page change

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| Organizer-authored "report N minutes before their match is called" rule, wherever it appears in `regulationsText` | regulations reader body | n/a | Whatever the organizer wrote, verbatim | **conditional: organizer confirmation** | No change on this page. `apps/api/src/workspaces/setup.py`'s public-information section has no reporting-time/check-in field to cite (checked, absent) — a system-chrome line naming "scheduled start" would be this tool inventing organizer policy, not confirming it. Package 13 should add a structured reporting-reference field; once the organizer confirms one, the entrant tier can cite it next to the rule without touching the rule's own wording. | R2: do not silently alter organizer policy; add system chrome only where an observable reference already exists | V3-PE15.1 | `docs/reference/debt-log.md` V3-22-1; `apps/api/src/workspaces/setup.py` (no matching field) |

## C3 — Entries-closed state (ruling R3)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `enter.tsx` closed-state heading | `/e/{slug}/enter`, no open event | closed | "No event is taking entries right now" (h2, repeating the page h1 "Entries are closed") | cut | (h2 removed — the page's own h1 "Entries are closed" is the one heading) | Plan §4 "Empty states": one explanation, no repetition | V3-PE16.1 | `enter.tsx` header section already renders "Entries are closed" as h1 when `openEvents.length === 0` |
| `enter.tsx` closed-state paragraph | same | closed | "No event is taking entries right now. Your tournament information is still available, and the organizer may publish a new entry window or timetable there." | change | "Entries are closed for {tournament name}. View the tournament page for schedules and results." | Ruling text verbatim; `EntryPageDTO`/`EntryTournamentDTO` carry no published entry-window field, so no reopening is promised (checked — absent) | V3-PE16.1 | `enter.tsx`; `apps/entrant/app/lib/entryPage.types.ts` (`EntryTournamentDTO`, `EntryPolicyDTO`); `enter.render.test.ts` "names the tournament in the closed state, once, with no reopening promise" |

## C4 — Account chrome, session-aware (ruling R4)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `enter.tsx` footer, signed-out | `/e/{slug}/enter` footer (every variant) | signed out (`hasEntrantSession(request) === false`) | "Signed in on this device? You can sign out here." + a "Sign out" button (both rendered unconditionally) | change | Only "Sign in" (link to `/e/login?next=.../enter/signed-in`); no sign-out affordance, no question | H1: one state-aware account action from the actual session, not a hedge asking the visitor to self-diagnose | V3-PE16.2 | `enter.tsx`; `enter.render.test.ts` / `logout.test.ts` "renders one state-aware account action, never both" / "renders no sign-out control for a signed-out visitor" |
| `enter.tsx` footer, signed-in | same | signed in (`hasEntrantSession(request) === true`) | Same unconditional copy as above, indistinguishable from the signed-out render | change | "Sign out" button only, plus "Signs out this device only. Entries you have already submitted are unaffected." (device-scope fact kept once, not stated twice) | H1; keeps the shared-device sign-out reachable per ruling | V3-PE16.2 | same tests, signed-in branch |

Session read: `hasEntrantSession(request)` (cookie **presence** only, `apps/entrant/app/lib/session.server.ts`) — the same read `PlayShell`'s header already uses for its `Sign in` / `My entries` split (§3.8). Not a credential relay (R8-D): the cookie's value is never read or forwarded, only whether it is present on the request this process is already holding. `EntryPageViewerDTO.signedIn` was not used here because it is pinned `false` for every request by design (a public, cacheable projection) — see `entryPage.types.ts`.

## C5 — Considered and NOT changed

| item | why no change |
|---|---|
| `myEntries.tsx` sign-in prompt | Already state-aware (`hasEntrantSession` gates "Sign in to see your entries" vs. the loading shell) and carries no sign-out control at all — not a duplicate of the pattern H1 fixes. |
| Displaying the signed-in account's name/email in the footer | Would need a browser-side credentialed call (like `my-entries.js`'s pattern) to a new API surface — no existing route returns it, and this tier's SSR loader cannot read the credential (R8-D). Out of this package's file scope (no new API route or script asset named in scope); the footer instead states the session fact it *can* know (cookie presence → "Sign out" is the account/session state shown). |
| `login.tsx` / `signup.tsx` / `resetPassword.tsx` / `partner.tsx` sign-in/out copy | Owned by concurrent package 08 (form controls) this session — not touched here; confirmed via `git diff --stat` before editing `enter.tsx`, which package 08 also has uncommitted button-height changes in (untouched by this package's edits). |
