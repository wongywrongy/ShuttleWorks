# V3 consolidated findings register

Generated from `docs/screenshots/ui-review/reviewed-v3/operator-all.md` (40 findings, `V3-OCnn.m`) and
`docs/screenshots/ui-review/reviewed-v3/public-all.md` (47 findings, `V3-PEnn.m`), grouped by delivery package
per `shuttleworks-v3-consolidated-plan.md` §7 (surface → package table). Every finding also implicitly belongs
to packages 25 (every-string ledger), 26 (accessibility/responsive) and 27 (evidence closure) per plan §7; those
three are omitted from each row below to avoid repeating them 87 times, and have no dedicated section here since
they apply to all findings uniformly.

Total: 87 findings (40 operator, 47 public). Severity: 26 major, 51 minor, 10 cosmetic — matches each book's own
stated scope-and-decision tally (operator 15/23/2, public 11/28/8).

## By package

### Package 03 — Repair conflict recovery and live counts

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC05.1 | OC05 | major | 03, 12 | The “Up next” list includes Koki Watanabe vs Kunlavut Vitidsarn and Wang Zhiyi vs Mia Blichfeldt, which appear as current/live on p.39. |
| V3-OC18.1 | OC18 | major | 03, 12 | The list toolbar says “ENGINE Meet Bracket”; rows use “C1 · S152”; the helper says meet and bracket share one court plan. |
| V3-OC18.2 | OC18 | minor | 03, 12 | The button says “Schedule next round (24)”; the explanatory line says 24 matches lack court and time assignments. |
| V3-OC19.1 | OC19 | major | 03, 12 | Court 1 and Court 3 say “Resolve this in Operations” while Operations > Live day is selected. Ordinary court cards have “Open”; conflict ... |
| V3-OC19.2 | OC19 | major | 03, 12 | The header reports “8 PLAYING MATCHES” above six courts, two of which contain conflicting current assignments. |

### Package 04 — Repair public court and schedule projection

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-PE09.1 | PE09 | major | 04, 11 | All six visible live cards across pp.57–58 say “Court information unavailable” despite the page inviting browsing “by court”. |
| V3-PE09.2 | PE09 | major | 04, 11 | Under 09:00, the final, quarterfinals, and round of 16 appear as “Scheduled”, with unresolved winner placeholders. |
| V3-PE09.3 | PE09 | minor | 04, 11 | The day line reads “Friday, July 31 124”; cards use “2026-07-31 · 09:00”; the title uses “Friday 31 July 2026”. |
| V3-PE09.4 | PE09 | minor | 04, 11 | Each live match has a saturated green header, beneath an additional “LIVE NOW” heading, with “Now” repeated on each card. |
| V3-PE11.1 | PE11 | major | 04, 11 | Round cards say “Scheduled” while their metadata says “Date to be confirmed · 10:00 · Court information unavailable”. |

### Package 05 — Remove consequential false claims

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC12.1 | OC12 | major | 05, 13, 15 | The checked “Public” column is explained as preserving publication intent for “a future public projection”; the footer says saving update... |
| V3-OC26.1 | OC26 | major | 05, 18 | Bracket says “Clear its data before disabling it” and also “existing matches or draws are preserved”. It also says “Owns operational data”. |

### Package 10 — Repair operator match rows and bracket geometry

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC16.1 | OC16 | major | 10 | Match cards say “slot 52 · court 5” and “slot 192 · court 1”. |
| V3-OC16.2 | OC16 | minor | 10 | The draw summary uses “done”, “live”, “ready”, “pending”; Matches uses “Done” and Live day uses “PLAYING MATCHES”. Public displays use “O... |
| V3-OC17.1 | OC17 | major | 10 | Side A scores are placed before Side B’s name; Side B scores are a second distant group. Doubles names wrap within each side. |

### Package 11 — Repair public match, round and bracket views

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-PE09.1 | PE09 | major | 04, 11 | All six visible live cards across pp.57–58 say “Court information unavailable” despite the page inviting browsing “by court”. |
| V3-PE09.2 | PE09 | major | 04, 11 | Under 09:00, the final, quarterfinals, and round of 16 appear as “Scheduled”, with unresolved winner placeholders. |
| V3-PE09.3 | PE09 | minor | 04, 11 | The day line reads “Friday, July 31 124”; cards use “2026-07-31 · 09:00”; the title uses “Friday 31 July 2026”. |
| V3-PE09.4 | PE09 | minor | 04, 11 | Each live match has a saturated green header, beneath an additional “LIVE NOW” heading, with “Now” repeated on each card. |
| V3-PE10.1 | PE10 | major | 11 | Later nodes say “Winner of R32 1” and “Winner of R16 1”, but source first-round nodes show names without a matching visible match number. |
| V3-PE10.2 | PE10 | minor | 11 | The mobile bracket shows only the left side and instructs readers to scroll within the panel or use Round view. |
| V3-PE11.1 | PE11 | major | 04, 11 | Round cards say “Scheduled” while their metadata says “Date to be confirmed · 10:00 · Court information unavailable”. |
| V3-PE12.1 | PE12 | minor | 11 | After searching Zhu, the banner says “Showing matches for Zhu. 1 match in this draw” while all other bracket names remain visible. |
| V3-PE13.1 | PE13 | minor | 11 | Cards show dates such as “2026-08-05 · 11:00 · Court 3”, while the draw heading does not state a timezone. |
| V3-PE14.1 | PE14 | major | 11 | Partner names are slash-joined and wrap over multiple lines. In the lower continuation (p.92), long pairs run into adjacent row space. |

### Package 12 — Finish hub, overview, Plan and Live day hierarchy

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC02.1 | OC02 | minor | 12 | Every ordinary row begins with “No issues reported”; completed rows also contain both “Completed” and “Complete”. A footer explains the d... |
| V3-OC02.2 | OC02 | minor | 12 | Yunavero Club Open shows “Confirmed entries not on the roster +1”; its next action is “View draws”. |
| V3-OC05.1 | OC05 | major | 03, 12 | The “Up next” list includes Koki Watanabe vs Kunlavut Vitidsarn and Wang Zhiyi vs Mia Blichfeldt, which appear as current/live on p.39. |
| V3-OC18.1 | OC18 | major | 03, 12 | The list toolbar says “ENGINE Meet Bracket”; rows use “C1 · S152”; the helper says meet and bracket share one court plan. |
| V3-OC18.2 | OC18 | minor | 03, 12 | The button says “Schedule next round (24)”; the explanatory line says 24 matches lack court and time assignments. |
| V3-OC19.1 | OC19 | major | 03, 12 | Court 1 and Court 3 say “Resolve this in Operations” while Operations > Live day is selected. Ordinary court cards have “Open”; conflict ... |
| V3-OC19.2 | OC19 | major | 03, 12 | The header reports “8 PLAYING MATCHES” above six courts, two of which contain conflicting current assignments. |

### Package 13 — Finish tournament setup

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC03.1 | OC03 | minor | 13 | The first step offers “Meet”, “Bracket”, and “Hybrid”, followed by “Modules” and inclusion messages. |
| V3-OC06.1 | OC06 | minor | 13 | “General identity”, “Public name”, “DOWNSTREAM IMPACT”, and “Saving this updates: Overview, public identity, exports.” appear in a basic ... |
| V3-OC07.1 | OC07 | major | 13 | Tournament starts at 5:00 PM on July 28, while Competition day 1 starts at 9:00 AM on July 28. No warning is visible. |
| V3-OC07.2 | OC07 | minor | 13 | Each session shows a comma-separated court input with the same court list repeated beneath it. |
| V3-OC07.3 | OC07 | minor | 13 | The introductory line says “Repeated clock-change times use the earlier occurrence.” for the Asia/Taipei schedule. |
| V3-OC08.1 | OC08 | minor | 13 | The page lists venue, address, and courts, then says “The current plan uses these courts, so Setup is read-only.” |
| V3-OC09.1 | OC09 | minor | 13 | MD, MS, WD, WS, and XD all say “Capacity 32”, although the draws table later distinguishes pairs and players. |
| V3-OC10.1 | OC10 | minor | 13 | The form uses “Simple”, “Badminton games”, “Default rest”, “Draw size 32 players”, and “Deuce (win by 2)”. |
| V3-OC11.1 | OC11 | minor | 13 | A “Partner rules” text field contains a sentence requiring confirmation; payment and approval are separate switches. |
| V3-OC12.1 | OC12 | major | 05, 13, 15 | The checked “Public” column is explained as preserving publication intent for “a future public projection”; the footer says saving update... |
| V3-OC13.1 | OC13 | minor | 13, 15 | The form uses “Public slug”, “Regulations URL”, “Logo URL”, and “Banner URL”; the description is a single-line input. |
| V3-OC13.2 | OC13 | minor | 13, 15 | Both logo and banner preview boxes say “Preview unavailable. Check the address before saving.” |
| V3-OC31.1 | OC31 | major | 13 | The checklist says “Overall: Ready”; Dates contains an out-of-window session (p.15), while image previews fail (p.27). |

### Package 14 — Finish roster, draw index and empty states

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC14.1 | OC14 | minor | 14 | The 253-player roster begins Kim Ibarra, Jin Yong, Nguyễn Thùy Linh, and Tung Quintero. No sort label or active column-sort indicator is ... |
| V3-OC15.1 | OC15 | minor | 14 | The far-right column is titled “STATUS” but contains “Open draw” buttons. |
| V3-OC30.1 | OC30 | major | 14, 18 | The body directs users to Administration > Modules, but the button says “Go to Setup · General”. |
| V3-OC32.1 | OC32 | minor | 14 | The paragraph says “Add a school from the actions bar to start” even though an “Add school” button is directly below it. |
| V3-OC33.1 | OC33 | minor | 14 | The page has zero matches, a “Regenerate from roster” toolbar action, disabled Add match, and a muted “Add players in Roster” empty-state... |
| V3-PE04.1 | PE04 | minor | 14, 21 | The list says “Mens Singles”, “Mens Doubles”, “Womens Singles”, and “Womens Doubles”, while individual draw titles use apostrophes. |
| V3-PE04.2 | PE04 | major | 14, 21 | A doubles row says “32 pairs” and also “0 confirmed registrations · 32 draw participants”. The registration column wraps across several l... |
| V3-PE04.3 | PE04 | minor | 14, 21 | Every row says “Draw published” and the action says “Draw”; the women’s doubles helper repeats “Draw published” again. |

### Package 15 — Verify publication and entrant privacy

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC12.1 | OC12 | major | 05, 13, 15 | The checked “Public” column is explained as preserving publication intent for “a future public projection”; the footer says saving update... |
| V3-OC13.1 | OC13 | minor | 13, 15 | The form uses “Public slug”, “Regulations URL”, “Logo URL”, and “Banner URL”; the description is a single-line input. |
| V3-OC13.2 | OC13 | minor | 13, 15 | Both logo and banner preview boxes say “Preview unavailable. Check the address before saving.” |
| V3-OC20.1 | OC20 | major | 15 | Entrant list is off while Draws & seeded entries and Results are on. The entrant description mentions names and player pages, but the dra... |

### Package 16 — Simplify venue-board publishing

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC22.1 | OC22 | minor | 16 | The preview shows a narrow vertical board beside a mostly empty Board sources column; lower court content is outside its initial internal... |
| V3-OC22.2 | OC22 | cosmetic | 16 | “Manage view-only display links and revoke access deliberately” appears above the sharing controls. |

### Package 17 — Build and validate signage density

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC24.1 | OC24 | major | 17 | Conflict cards say “The tournament desk is resolving a court assignment.” The PDF shows an assignment conflict, not an acknowledgement by... |
| V3-OC24.2 | OC24 | minor | 17 | The header reads “04:07 AM” and “Updated 04:07 AM”, without a date or timezone. |

### Package 18 — Finish account, team, tools and settings

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC04.1 | OC04 | minor | 18 | “Change photo” and “Save changes” sit above fields; the explanation that profile editing requires sign-in appears below them. |
| V3-OC25.1 | OC25 | minor | 18 | “Send by email” is selected, while the empty list says “No invite links yet.” The section title is “COLLABORATOR INVITES”. |
| V3-OC26.1 | OC26 | major | 05, 18 | Bracket says “Clear its data before disabling it” and also “existing matches or draws are preserved”. It also says “Owns operational data”. |
| V3-OC29.1 | OC29 | cosmetic | 18 | The details section labels the current state “Lifecycle” and says “To retire the workspace, use Archive below.” The date is ISO-formatted. |
| V3-OC30.1 | OC30 | major | 14, 18 | The body directs users to Administration > Modules, but the button says “Go to Setup · General”. |

### Package 19 — Make backup, restore and sync decisions safe to understand

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC27.1 | OC27 | major | 19 | The page says “Reconciliation evidence”, “Rejected operations stay immutable”, “cloud acknowledgement”, and “No open quarantined operatio... |
| V3-OC27.2 | OC27 | major | 19 | Multiple backups share Aug 31, 2026, 7:31:02 PM and are distinguished by byte deltas and long JSON filenames. |

### Package 20 — Make activity history readable

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-OC28.1 | OC28 | minor | 20 | Rows say “Updated Public information”, “Updated Staff”, and “Updated General”; section names are repeated beside local@dev. |

### Package 21 — Simplify public discovery, overview and directory

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-PE01.1 | PE01 | cosmetic | 21 | The sentence says “Explore Badminton tournaments, schedules, and published results through ShuttleWorks.” |
| V3-PE01.2 | PE01 | minor | 21 | Yunavero Club Open says “Entries open · closes in 15d”. |
| V3-PE01.3 | PE01 | minor | 21 | Rows identify Kingsway Centre, Utilita Arena, and other venue names, but do not consistently show city/country beside them. |
| V3-PE02.1 | PE02 | cosmetic | 21 | The recurring footer says “ShuttleWorks · tournament entries · by Yunavero”, including on completed results and draw pages. |
| V3-PE03.1 | PE03 | major | 21 | One paragraph repeats the title, live state, category, prize amount, location, venue, and five draw sizes, including “international circu... |
| V3-PE03.2 | PE03 | major | 21 | Overview shows “Event registrations 0”; the same tournament has a 253-player directory and five 32-entry draws in the book. |
| V3-PE03.3 | PE03 | minor | 21 | The title’s status is “Entries closed”, while the main button is “Follow live matches” and the description says play is underway. |
| V3-PE04.1 | PE04 | minor | 14, 21 | The list says “Mens Singles”, “Mens Doubles”, “Womens Singles”, and “Womens Doubles”, while individual draw titles use apostrophes. |
| V3-PE04.2 | PE04 | major | 14, 21 | A doubles row says “32 pairs” and also “0 confirmed registrations · 32 draw participants”. The registration column wraps across several l... |
| V3-PE04.3 | PE04 | minor | 14, 21 | Every row says “Draw published” and the action says “Draw”; the women’s doubles helper repeats “Draw published” again. |
| V3-PE05.1 | PE05 | minor | 21 | The directory has 253 names across seven desktop and fourteen mobile capture segments. Letter headings exist, but no visible jump index i... |
| V3-PE05.2 | PE05 | cosmetic | 21 | “253 players” appears left of the search field and again below it. The field uses placeholder-only “Filter by name or club”. |

### Package 22 — Finish regulations and closed-entry pages

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-PE15.1 | PE15 | major | 22 | The rule says players report “15 minutes before their match is called”. A call is itself an event that the player cannot normally predict. |
| V3-PE15.2 | PE15 | minor | 22 | Links say “View events” and “View entrants”, while the tournament navigation uses Draws and Players; the text includes a raw Wikipedia URL. |
| V3-PE16.1 | PE16 | minor | 22, 24 | The heading and paragraph both say no event is taking entries; the paragraph suggests the organizer may publish a new entry window or tim... |
| V3-PE16.2 | PE16 | minor | 22, 24 | The header says Sign in, while the body offers Sign out with “Signed in on this device?” and a device-scope explanation. |

### Package 23 — Verify account, confirmation and reset journeys

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-PE19.1 | PE19 | minor | 23 | The introduction says “Use the entrant account you signed up with. Your account manages tournament entries; signing in does not submit an... |
| V3-PE20.1 | PE20 | cosmetic | 23 | The message says “Your entrant account is ready. Sign in below with the address and password you just gave.” |
| V3-PE21.1 | PE21 | cosmetic | 23 | The useful email/password correction ends with “Nothing about your account has changed.” |
| V3-PE22.1 | PE22 | minor | 23 | The captured outcome shows a sign-in form with “Sign in to continue. The form below is ready for your account”; the header says “Switch a... |
| V3-PE23.1 | PE23 | minor | 23 | Copy includes “Create an entrant account”, “Sign-in address”, “Very common passwords are refused”, and “How the organizer sees you on an ... |
| V3-PE23.2 | PE23 | minor | 23 | The Cloudflare widget contains “For testing only. If seen, report to site owner”, plus “HUMAN CHECK” and “Human check complete”. |
| V3-PE24.1 | PE24 | minor | 23 | The heading says “Create your account to enter this tournament” without naming the tournament on the form. |
| V3-PE25.1 | PE25 | minor | 23 | The page tells the user to sign in and ask for a new confirmation link; no adjacent resend control or destination address is shown. |
| V3-PE26.1 | PE26 | major | 23 | The success message says “Any entries you already sent are now with the organizer.” |
| V3-PE27.1 | PE27 | minor | 23 | The notice says the link is “no longer usable” and “a fresh link will replace this one” before a new link has been requested. |
| V3-PE28.1 | PE28 | cosmetic | 23 | The notice says a fresh link was sent, tells the user to open the newest message, and says saved entries are unchanged; the next paragrap... |
| V3-PE29.1 | PE29 | cosmetic | 23 | The action says “Email me a link” and the footer says “Remembered it? Sign in.” |
| V3-PE31.1 | PE31 | cosmetic | 23 | The message says the link “is on its way” and “is good for one hour”. |
| V3-PE32.1 | PE32 | minor | 23 | The heading says “Password updated”; the introduction says it has changed; the green notice says it is set and repeats the sign-in instru... |
| V3-PE33.1 | PE33 | minor | 23 | The notice says “That reset link is no longer usable. Ask for a fresh link and try again; no password was changed.” |
| V3-PE34.1 | PE34 | minor | 23 | The new-password form has a field label but no persistent requirements helper; requirements are in the warning banner above it. |

### Package 24 — Verify invitations, My entries and receipts

| ID | Surface | Severity | Package(s) | Observation |
|---|---|---|---|---|
| V3-PE16.1 | PE16 | minor | 22, 24 | The heading and paragraph both say no event is taking entries; the paragraph suggests the organizer may publish a new entry window or tim... |
| V3-PE16.2 | PE16 | minor | 22, 24 | The header says Sign in, while the body offers Sign out with “Signed in on this device?” and a device-scope explanation. |
| V3-PE35.1 | PE35 | minor | 24 | The message says “Invitations expire, and each one can be accepted once”; its action is Browse tournaments. |
| V3-PE36.1 | PE36 | major | 24 | The body says “We could not verify this accepted entry” beneath “Partner invitation update”. |
| V3-PE37.1 | PE37 | minor | 24 | The message tells the user to ask the inviter for a new link, but the only button says Sign in. |
| V3-PE38.1 | PE38 | minor | 24 | The introduction describes every tournament entered; the card heading says “Sign in to see your entries”; the card paragraph repeats avai... |
| V3-PE39.1 | PE39 | minor | 24 | The receipt gate prints a long placeholder UUID and says “The reference is safe”, then describes “payment state”. |

## Packages with no directly-mapped findings

Packages 01, 02, 06, 07, 08, 09, 25, 26, 27, 28 receive no finding directly via the §7 surface table (they are cross-cutting,
evidence-only, or reached only through 25/26/27 dependency chains); consult plan §1/§2 for their scope.

## Findings the plan supersedes or corrects

Plan §3 explicitly overrides the book's recommendation for one finding by ID:

- **V3-OC22.1** (Display preview occupies a narrow slice of a wide page) — plan §3 row "Remove the tiny board
  preview instead of widening it" states: *"Supersedes the treatment in V3-OC22.1. Use an explicit
  “Preview fullscreen” action; test board configuration and return path."* This replaces the book's own
  proposed treatment (widen the preview) with a different mechanism (remove/replace with fullscreen action).

The following correspondences are the compiler's inference from strong textual overlap between a finding's
observation/treatment and a §3 decision row — the plan text does not cite these finding IDs explicitly, so treat
them as candidate links for implementer review, not confirmed overrides:

- **V3-OC05.1** / **V3-PE09.4** — §3 row "Match state “Live” vs “On court”" (Resolve): adapts the vocabulary
  both findings raise (current/live matches labeled "Up next"; repeated "LIVE NOW" bands).
- **V3-OC24.1** — §3 row "Board conflict copy says “wait for next announcement”" (Adapt): directly rewrites the
  copy this finding flags ("The tournament desk is resolving a court assignment").
- **V3-PE39.1** — §3 row "Short entry reference" (Adopt conditionally): addresses the raw-UUID receipt reference
  this finding flags.
- **V3-OC10.1** — §3 row "Replace Deuce with “Setting … cap 30”" (Adapt): addresses the "Deuce (win by 2)"
  label this finding flags.

These five inferred links are also recorded in the `planDecision` field of the corresponding `findings.json`
entries alongside the one explicit citation; all other findings carry `planDecision: null`.

