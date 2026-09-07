# Public final visual review

Review date: 2026-09-06  
Capture: `docs/screenshots/ui-review/remediation-2026-09-06/tailscale-release/public-entrant-surface-book.html` and matching PDF/manifest  
Source revision: `7cc638c2589cfe412dc97fccc9b2dfe7aa4367a7` plus dirty patch `013e08004c73b1df6064e7023f39d4092ccbf0ce26f8121ea7ff2b466eedf41a`  
Capture: 39 surfaces, 147 native PNG segments, desktop 1440x900 DPR2 and mobile 390x844 DPR2. Images were extracted from the completed HTML data URIs into `/tmp/public-final-review/` and inspected with `view_image`; HTTP status metadata was used only as capture context.

## Outcome

All 39 requested public surfaces captured successfully with zero reported console errors. The public layouts reflow at 390px: discovery, tournament pages, schedules, forms, outcome states, regulations, invitations, My entries, and receipt all stay within the viewport. The first mobile schedule segment shows the `LIVE NOW` heading and live card. Long singles and doubles brackets are intentionally horizontally scrollable inside their bracket panel; this is retained because it preserves full player names and feeder structure. Round and list views provide the mobile alternative.

The human-check component on account creation contains the visible Cloudflare test badge and red text `For testing only. If seen, report to site owner` on PE23 and PE24 (desktop and mobile continuation segments). This is fixture context for the private Tailscale demo capture, not an established production defect or release blocker. The anti-abuse verification remains intentionally retained; the controlled success evidence confirms the help text is hidden in the completed state.

The Korea T030 discovery/overview data presents entries closed; this is the durable closed-entry state. The Taipei T029 live state and court projection are covered by the existing dispositions: where authoritative court data is unavailable the card says `Court information unavailable`; no court name was invented. PE06–PE08 are three views of the same draw index surface family, not three separate products. Account outcome captures show the requested headings and gate-one/account journey states; no external email, payment provider, or transaction validity claim is made here.

## PE01–PE39 ledger

`PASS` means the native rendered surface was retained after desktop/mobile visual inspection. `PASS*` marks the intentionally scrollable bracket continuation. `PASS (fixture context)` records the intentionally visible demo anti-abuse provider state without asserting a production defect.

| Surface | Native route / view | Result | Visual review |
|---|---|---|---|
| PE01 | S01 Discovery · Season | PASS | Season header, active/taking/completed grouping, search and cards reflow cleanly. |
| PE02 | S02 Discovery · Completed tournaments | PASS | Completed state and results links remain legible on mobile. |
| PE03 | S03 Tournament · Overview | PASS | Closed-entry overview, dates, venue, document and follow-live CTA present. |
| PE04 | S04 Tournament · Events | PASS | Event catalog stacks into readable mobile cards. |
| PE05 | S05 Tournament · Players | PASS | Directory uses “players”, full names remain visible, filter precedes alphabetized list. |
| PE06 | S06 Tournament · Draws index | PASS | Same draw-index family; event metadata and Draw actions remain readable. |
| PE07 | S07 Tournament · Seeded entries | PASS | Same draw-index family; seed state remains readable. |
| PE08 | S08 Tournament · Winners | PASS | Same draw-index family; honors/results state remains readable. |
| PE09 | S09 Schedule and live | PASS | `LIVE NOW` appears in the first mobile 844px segment; court fallback is explicit. |
| PE10 | S10 Singles full bracket | PASS* | Full names and round headings retained; horizontal bracket scroll is intentional. |
| PE11 | S11 Singles round view | PASS | Round 2 of 5 and previous/next controls are visible and usable. |
| PE12 | S12 Singles player path | PASS* | Filtered player path remains available with bracket continuation. |
| PE13 | S13 Singles match list | PASS | Match cards stack with full names, time and court metadata. |
| PE14 | S14 Doubles detail | PASS* | Full pair names wrap inside intentional bracket scroll panel. |
| PE15 | S15 Regulations reader | PASS | Actual outcome heading and document metadata are visible; mobile text remains readable. |
| PE16 | S16 Entry form | PASS | Closed-entry outcome is clear and provides tournament-information route. |
| PE17 | S17 Entry form · Signed-in outcome | PASS | Signed-in outcome state has clear next action. |
| PE18 | S18 Entry form · Account-created outcome | PASS | Account-created outcome has clear continuation. |
| PE19 | S19 Account · Sign in | PASS | Form hierarchy, recovery and create-account links reflow cleanly. |
| PE20 | S20 Account · Created outcome | PASS | Created state has clear sign-in continuation. |
| PE21 | S21 Account · Failed sign-in outcome | PASS | Error heading/message and retry form remain visible. |
| PE22 | S22 Account · Signed-in outcome | PASS | Signed-in state and switch-account control are clear. |
| PE23 | S23 Account · Create account | PASS (fixture context) | Human-check provider and testing banner are intentionally present in this private demo capture; no release defect asserted. |
| PE24 | S24 Account · Create account for tournament | PASS (fixture context) | Same retained anti-abuse fixture appears in desktop/mobile continuation; no release defect asserted. |
| PE25 | S25 Verify address | PASS | Gate-one confirmation heading and next step are clear. |
| PE26 | S26 Verification complete | PASS | Success outcome and See my entries CTA are visible. |
| PE27 | S27 Verification failed | PASS | Invalid/expired verification outcome gives actionable recovery. |
| PE28 | S28 Verification email sent | PASS | Resend/delivery guidance is readable. |
| PE29 | S29 Forgot password | PASS | Reset request form is compact and readable. |
| PE30 | S30 Reset password | PASS | Reset form and one-hour guidance are clear. |
| PE31 | S31 Reset email sent | PASS | Delivery outcome and return action are clear. |
| PE32 | S32 Password reset complete | PASS | Actual success heading and sign-in action are visible. |
| PE33 | S33 Password reset failed | PASS | Expired-link outcome and fresh-link action are visible. |
| PE34 | S34 New password failed | PASS | Requirement error preserves valid-link guidance and retry field. |
| PE35 | S35 Doubles partner invitation | PASS | Invitation update state has a clear My entries action. |
| PE36 | S36 Doubles partner accepted | PASS | Accepted/updated outcome remains compact and readable. |
| PE37 | S37 Doubles partner failed | PASS | Invalid invitation outcome is explicit and actionable. |
| PE38 | S38 My entries (signed out) | PASS | Sign-in gate heading and action are visible without excess chrome. |
| PE39 | S39 Entry receipt | PASS | Receipt reference, account-access gate and return action reflow correctly. |

## Evidence notes

- Completed capture log: `/tmp/sw-tailscale-public-release.log` (`pipeline complete: 39 surfaces in 282.6s`).
- Manifest: `docs/screenshots/ui-review/remediation-2026-09-06/tailscale-release/public-entrant-surface-book.manifest.json`.
- Native image extraction order follows manifest viewport segments: S01 desktop images 000–003, S01 mobile 004–008, through S39 mobile image 146.
- No source edits were made for this review.
