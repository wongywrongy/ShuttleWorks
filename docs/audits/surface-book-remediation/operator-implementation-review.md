# Operator implementation review

Date: 2026-09-06. This is an integrated implementation review of the 40 operator findings. The reviewed PDF is historical evidence and does not establish a repository commit. The current checkout is feat/surface-book-remediation at HEAD 7cc638c2589cfe412dc97fccc9b2dfe7aa4367a, with concurrent dirty work preserved.

The 33-surface operator capture was run at 1440×900, DPR 2, against the Korea fixture 79903f30-c9aa-4a95-86cf-cbfd0fbde500. The integrated v4 artifact has 33 complete surfaces; its OC24 missing display-token records are supplemented by [display-1920.png](evidence/operator/display-1920.png). Native evidence also covers the session editor, roster width, Taipei populated matches, controlled asset preview, and reversible backup/display actions in [the evidence index](register.md).

All 40 operator rows are accepted in the [findings register](findings.json), with implementationStatus separate from disposition. OC13.1 is implemented: the local controlled preview verifies both valid logo/banner previews and the error fallback before save; external delivery is outside this UI finding. OC17.1 uses the separate T029 Taipei evidence block ([taipei-matches.png](evidence/operator/taipei-matches.png)); it shows 155 matches, readable R32 references, aligned three-game score columns, and separated doubles partners. The session and roster evidence are [session-layout.png](evidence/operator/session-layout.png) and [roster-width.png](evidence/operator/roster-width.png).

The integrated evidence supports a mixed operator quality assessment: the normal component families are around 4/5, while dense draw and operational surfaces remain around 3/5. The source baseline ratings remain unchanged in the canonical records and component ledgers. This is one integrated review; no independent reviewer sign-off is claimed.

The deployed Tailscale fixture contains two durable current-match conflicts: Court 1 (Koki/Kunlavut versus Yudai/Zhu) and Court 3 (Jin/Lwi versus Goh/Yap). Operations exposes both records; Display withholds those two courts and projects the other four. The system does not auto-resolve this state; an operator must choose the outcome.

Verification supplied by integration includes the full backend suite (2320 passed, 72 skipped), 11 public-court tests, ruff/import-linter, DTO generation/parity, class-token checks, and focused operator suites. Offline/session/reconnect/recovery covered 28 tests; that does not prove an interactive browser disconnect journey. Final persistence-boundary testing remains with the integration owner.

## Category assessment

| Category | Baseline | Current | Basis |
| --- | ---: | ---: | --- |
| Overall | 2 | 3 | Integrated operator review; normal forms improved, dense operational surfaces remain compact. |
| Spacing/alignment | 3 | 4 | Setup and standard panels align; dense boards remain constrained. |
| Density | 2 | 3 | Information hierarchy improved; draw/live boards retain high density. |
| Typography/hierarchy | 3 | 4 | Human labels and match identity are clearer. |
| Background | 4 | 4 | Neutral canvas remains suitable. |
| Panels | 3 | 4 | Shared panels are coherent; operational grids remain dense. |
| Borders | 3 | 4 | Shared treatment is consistent. |
| Color | 2 | 4 | Status and accent use are more restrained. |
| Consistency | 3 | 4 | Shared identity/status patterns now span routes. |
| Wording | 2 | 4 | User-facing task language replaces implementation terms. |
| Interaction | N/R | N/R | Interaction is recorded only where focused Save/retry/restore/cancel/auth/token checks cover it; full AT and browser-offline claims are excluded. |

## Retained per-surface ratings and current assessment

Baseline values preserve the reviewed component ledger in book-notes.md. Current values are an integrated reasoned assessment, not independent re-review. Order is O/S/D/H/P/C/W. Dense draw/operations surfaces remain 3; normal families are 4.

| Surface | Baseline O/S/D/H/P/C/W | Current O/S/D/H/P/C/W | Decision |
| --- | --- | --- | --- |
| OC01 | 3/3/3/3/4/2/3 | N/R/N/R/N/R/N/R/N/R/N/R/N/R | Retain OC01 route component and its verified repair; row-specific evidence is in findings.json. |
| OC02 | 3/3/3/3/4/2/3 | 4/4/4/4/4/4/4 | Retain OC02 route component and its verified repair; row-specific evidence is in findings.json. |
| OC03 | 3/4/3/3/4/3/2 | 4/4/4/4/4/4/4 | Retain OC03 route component and its verified repair; row-specific evidence is in findings.json. |
| OC04 | 3/4/4/3/4/3/3 | 4/4/4/4/4/4/4 | Retain OC04 route component and its verified repair; row-specific evidence is in findings.json. |
| OC05 | 2/3/2/2/3/3/2 | 4/4/4/4/4/4/4 | Retain OC05 route component and its verified repair; row-specific evidence is in findings.json. |
| OC06 | 3/3/3/4/4/3/2 | 4/4/4/4/4/4/4 | Retain OC06 route component and its verified repair; row-specific evidence is in findings.json. |
| OC07 | 2/2/2/3/3/3/2 | 4/4/3/4/4/4/4 | Retain OC07 route component and its verified repair; row-specific evidence is in findings.json. |
| OC08 | 4/4/4/4/4/3/4 | 4/4/4/4/4/4/4 | Retain OC08 route component and its verified repair; row-specific evidence is in findings.json. |
| OC09 | 2/2/2/3/4/3/3 | 4/4/4/4/4/4/4 | Retain OC09 route component and its verified repair; row-specific evidence is in findings.json. |
| OC10 | 3/3/3/3/4/3/2 | 4/4/4/4/4/4/4 | Retain OC10 route component and its verified repair; row-specific evidence is in findings.json. |
| OC11 | 3/3/3/3/4/3/2 | 4/4/4/4/4/4/4 | Retain OC11 route component and its verified repair; row-specific evidence is in findings.json. |
| OC12 | 3/3/3/3/3/3/2 | 4/4/4/4/4/4/4 | Retain OC12 route component and its verified repair; row-specific evidence is in findings.json. |
| OC13 | 2/3/2/3/4/3/2 | 4/4/4/4/4/4/4 | Retain OC13 route component and its verified repair; row-specific evidence is in findings.json. |
| OC14 | 3/4/3/4/4/3/4 | 4/4/4/4/4/4/4 | Retain OC14 route component and its verified repair; row-specific evidence is in findings.json. |
| OC15 | 3/3/3/3/4/3/2 | 4/4/4/4/4/4/4 | Retain OC15 route component and its verified repair; row-specific evidence is in findings.json. |
| OC16 | 2/2/2/2/2/2/1 | 3/3/3/3/3/4/4 | Retain OC16 route component and its verified repair; row-specific evidence is in findings.json. |
| OC17 | 2/3/2/2/4/3/3 | 4/4/3/4/4/4/4 | Retain OC17 route component and its verified repair; row-specific evidence is in findings.json. |
| OC18 | 2/3/3/2/3/2/2 | 3/3/3/3/3/4/4 | Retain OC18 route component and its verified repair; row-specific evidence is in findings.json. |
| OC19 | 2/3/3/2/3/2/3 | 4/4/3/4/4/4/4 | Retain OC19 route component and its verified repair; row-specific evidence is in findings.json. |
| OC20 | 3/4/4/3/4/3/4 | 4/4/4/4/4/4/4 | Retain OC20 route component and its verified repair; row-specific evidence is in findings.json. |
| OC21 | 3/4/4/3/4/3/4 | 4/4/4/4/4/4/4 | Retain OC21 route component and its verified repair; row-specific evidence is in findings.json. |
| OC22 | 2/3/2/3/3/3/2 | 4/4/3/4/4/4/4 | Retain OC22 route component and its verified repair; row-specific evidence is in findings.json. |
| OC23 | 2/3/2/3/3/3/2 | 4/4/3/4/4/4/4 | Retain OC23 route component and its verified repair; row-specific evidence is in findings.json. |
| OC24 | 2/3/2/2/2/2/3 | 4/4/4/4/4/4/4 | Retain OC24 route component and its verified repair; row-specific evidence is in findings.json. |
| OC25 | 3/4/3/3/4/3/3 | 4/4/4/4/4/4/4 | Retain OC25 route component and its verified repair; row-specific evidence is in findings.json. |
| OC26 | 2/4/3/2/4/3/1 | 3/4/3/3/4/4/4 | Retain OC26 route component and its verified repair; row-specific evidence is in findings.json. |
| OC27 | 2/3/2/2/3/3/1 | 3/3/3/4/4/4/4 | Retain OC27 route component and its verified repair; row-specific evidence is in findings.json. |
| OC28 | 4/4/4/4/4/4/3 | 4/4/4/4/4/4/3 | Retain Activity log route and heading scale; evidence recorded in findings.json. |
| OC29 | 3/3/4/3/4/4/3 | 4/4/4/4/4/4/3 | Retain OC29 route component and its verified repair; row-specific evidence is in findings.json. |
| OC30 | 3/4/4/3/4/4/2 | 4/4/4/4/4/4/4 | Retain OC30 route component and its verified repair; row-specific evidence is in findings.json. |
| OC31 | 4/4/4/4/4/4/4 | 4/4/4/4/4/4/4 | Retain setup checklist guard copy and direct next step; evidence recorded in findings.json. |
| OC32 | 3/3/4/3/4/3/3 | 4/4/4/4/4/4/4 | Retain OC32 route component and its verified repair; row-specific evidence is in findings.json. |
| OC33 | 2/3/3/2/4/3/2 | 3/4/3/3/4/4/4 | Retain usable empty-roster action while manual creation remains disabled in the toolbar; evidence recorded in findings.json. |
