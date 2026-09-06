# Public entrant implementation review

Date: 2026-09-06. This review covers the 34 public findings and the 40 public render records (39 declared routes plus runtime player detail). The reviewed v2 book remains the historical baseline; its per-surface ratings are retained in the source ledgers and canonical register.

The implementation evidence is an intermediate integrated v3 capture: 39 declared routes returned HTTP 200, with the runtime player-detail route retained separately. It covers discovery, overview, schedule, bracket, regulations, account continuation, and receipt flows. It is not a final Tailscale capture. Account journey evidence is in [the account journey README](evidence/account-journey/README.md), and selected v3 native evidence is [the doubles bracket capture](evidence/public-v3/draw-doubles-detail-mobile-segment-1.png).

All 34 public rows are accepted in the [findings register](findings.json), with implementation status recorded separately. The integrated assessment is mixed: normal reading surfaces are around 4/5, while dense schedule/draw surfaces and the compact account continuation remain around 3/5. PE22 is supported by the real authenticated account session journey. No independent review is claimed. External email/payment delivery, assistive technology coverage beyond repository checks, and final Tailscale delivery remain outside this checkpoint.

Focused evidence includes live-first schedule ordering, long-name and doubles rendering, explicit bracket continuation, truthful regulation wrapping, safe signed-in return, copyable receipt references, and the neutral public court-unavailable state. PE23 controlled success callback and PE26 valid-token completion are verified in the real account journey; no provider or production-account claim is made. Recheck PE12, PE10, and PE39 during the final tail-scale capture because the v3 capture predates the latest integrated visual pass.

## Category assessment

| Category | Baseline | Current | Basis |
| --- | ---: | ---: | --- |
| Overall | 3 | 3 | Integrated public checkpoint; normal reading surfaces stronger, dense routes remain compact. |
| Spacing/alignment | 3 | 4 | Repeated edges and responsive spacing inspected. |
| Density | 2 | 3 | Schedule and draw information remains intentionally dense. |
| Typography/hierarchy | 3 | 4 | Names, headings, scores, and metadata are clearer. |
| Background | 4 | 4 | Neutral public canvas remains suitable. |
| Panels | 3 | 4 | Shared reading boundaries are clearer. |
| Borders | 3 | 4 | Visible rules are consistent. |
| Color | 3 | 4 | Accent is reserved for action and active location. |
| Consistency | 3 | 4 | Shared navigation and match patterns span public routes. |
| Wording | 3 | 4 | Lifecycle and count vocabulary is consumer-facing. |
| Interaction | N/R | N/R | Interaction is recorded only where focused Save/retry/restore/cancel/auth/token checks cover it; full AT and browser-offline claims are excluded. |

## Retained per-surface ratings and current assessment

Baseline values preserve the reviewed component ledger in book-notes.md. Current values are an integrated reasoned assessment, not independent re-review. Order is O/S/D/H/P/C/W. Dense draw/operations surfaces remain 3; normal families are 4.

| Surface | Baseline O/S/D/H/P/C/W | Current O/S/D/H/P/C/W | Decision |
| --- | --- | --- | --- |
| PE01 | 3/4/3/3/3/3/2 | 4/4/4/4/4/4/4 | Retain PE01 route component and its verified repair; row-specific evidence is in findings.json. |
| PE02 | 3/4/3/2/3/3/2 | 4/4/4/4/4/4/4 | Retain PE02 route component and its verified repair; row-specific evidence is in findings.json. |
| PE03 | 3/3/3/3/3/3/2 | 4/4/3/4/3/4/4 | Retain PE03 route component and its verified repair; row-specific evidence is in findings.json. |
| PE04 | 2/2/2/3/3/3/2 | 4/4/4/4/4/4/4 | Retain PE04 route component and its verified repair; row-specific evidence is in findings.json. |
| PE05 | 3/2/2/3/4/3/3 | 4/4/4/4/4/4/4 | Retain PE05 route component and its verified repair; row-specific evidence is in findings.json. |
| PE06 | 2/2/2/3/3/3/2 | 4/4/4/4/4/4/4 | Retain draws index alias behavior; no new product surface is introduced. |
| PE07 | 2/2/2/3/3/3/2 | 4/4/4/4/4/4/4 | Retain seeds alias to the draws index; evidence recorded in findings.json. |
| PE08 | 2/2/2/3/3/3/2 | 4/4/4/4/4/4/4 | Retain winners alias to the draws index; evidence recorded in findings.json. |
| PE09 | 2/3/2/2/2/3/3 | 4/4/3/4/3/4/4 | Retain PE09 route component and its verified repair; row-specific evidence is in findings.json. |
| PE10 | 2/3/2/2/3/3/3 | 3/3/3/3/3/4/4 | Retain PE10 route component and its verified repair; row-specific evidence is in findings.json. |
| PE11 | 3/3/3/3/3/3/3 | 4/4/4/4/4/4/4 | Retain PE11 route component and its verified repair; row-specific evidence is in findings.json. |
| PE12 | 2/3/2/2/3/3/3 | 3/3/3/3/3/4/4 | Retain PE12 route component and its verified repair; row-specific evidence is in findings.json. |
| PE13 | 3/3/2/3/2/3/3 | 4/4/4/4/4/4/4 | Retain PE13 route component and its verified repair; row-specific evidence is in findings.json. |
| PE14 | 2/3/1/2/3/3/3 | 3/3/3/3/3/4/4 | Retain PE14 route component and its verified repair; row-specific evidence is in findings.json. |
| PE15 | 2/2/2/3/3/3/3 | 4/4/4/4/4/4/4 | Retain PE15 route component and its verified repair; row-specific evidence is in findings.json. |
| PE16 | 3/4/4/3/4/3/2 | 4/4/4/4/4/4/4 | Retain PE16 route component and its verified repair; row-specific evidence is in findings.json. |
| PE17 | 3/4/4/3/4/3/2 | 4/4/4/4/4/4/4 | Retain PE17 route component and its verified repair; row-specific evidence is in findings.json. |
| PE18 | 3/4/4/3/4/3/2 | 4/4/4/4/4/4/4 | Retain PE18 route component and its verified repair; row-specific evidence is in findings.json. |
| PE19 | 4/4/4/4/4/3/3 | 4/4/4/4/4/4/4 | Retain PE19 route component and its verified repair; row-specific evidence is in findings.json. |
| PE20 | 4/4/4/4/4/4/3 | 4/4/4/4/4/4/4 | Retain PE20 route component and its verified repair; row-specific evidence is in findings.json. |
| PE21 | 4/4/4/4/4/4/4 | 4/4/4/4/4/4/4 | Retain PE21 route component and its verified repair; row-specific evidence is in findings.json. |
| PE22 | 2/4/4/2/4/4/2 | 4/4/4/4/4/4/4 | Retain PE22 route component and its verified repair; row-specific evidence is in findings.json. |
| PE23 | 3/4/3/3/3/3/3 | 4/4/4/4/4/4/4 | Retain PE23 route component and its verified repair; row-specific evidence is in findings.json. |
| PE24 | 3/4/3/3/3/3/2 | 4/4/4/4/4/4/4 | Retain PE24 route component and its verified repair; row-specific evidence is in findings.json. |
| PE25 | 4/4/4/4/4/3/4 | 4/4/4/4/4/4/4 | Retain PE25 route component and its verified repair; row-specific evidence is in findings.json. |
| PE26 | 3/4/4/3/4/4/3 | 4/4/4/4/4/4/4 | Retain PE26 route component and its verified repair; row-specific evidence is in findings.json. |
| PE27 | 4/4/4/4/4/4/4 | 4/4/4/4/4/4/4 | Retain PE27 route component and its verified repair; row-specific evidence is in findings.json. |
| PE28 | 4/4/4/4/4/4/4 | 4/4/4/4/4/4/4 | Retain PE28 route component and its verified repair; row-specific evidence is in findings.json. |
| PE29 | 4/4/4/4/4/3/4 | 4/4/4/4/4/4/4 | Retain PE29 route component and its verified repair; row-specific evidence is in findings.json. |
| PE30 | 4/4/4/4/4/3/4 | 4/4/4/4/4/4/4 | Retain PE30 route component and its verified repair; row-specific evidence is in findings.json. |
| PE31 | 4/4/4/4/4/4/4 | 4/4/4/4/4/4/4 | Retain PE31 route component and its verified repair; row-specific evidence is in findings.json. |
| PE32 | 3/4/4/3/4/4/3 | 4/4/4/4/4/4/4 | Retain PE32 route component and its verified repair; row-specific evidence is in findings.json. |
| PE33 | 4/4/4/4/4/4/4 | 4/4/4/4/4/4/4 | Retain PE33 route component and its verified repair; row-specific evidence is in findings.json. |
| PE34 | 4/4/4/4/4/4/4 | 4/4/4/4/4/4/4 | Retain PE34 route component and its verified repair; row-specific evidence is in findings.json. |
| PE35 | 4/4/4/4/4/3/4 | 4/4/4/4/4/4/4 | Retain PE35 route component and its verified repair; row-specific evidence is in findings.json. |
| PE36 | 3/4/4/3/4/3/3 | 4/4/4/4/4/4/4 | Retain PE36 route component and its verified repair; row-specific evidence is in findings.json. |
| PE37 | 2/4/4/2/4/4/2 | 4/4/4/4/4/4/4 | Retain PE37 route component and its verified repair; row-specific evidence is in findings.json. |
| PE38 | 4/4/4/4/4/3/4 | 4/4/4/4/4/4/4 | Retain PE38 route component and its verified repair; row-specific evidence is in findings.json. |
| PE39 | 2/3/3/2/2/3/2 | 4/4/4/4/3/4/4 | Retain PE39 route component and its verified repair; row-specific evidence is in findings.json. |
