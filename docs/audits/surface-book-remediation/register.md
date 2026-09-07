# Surface-book remediation — implementation register

Date: 2026-09-06. findings.json is the single authoritative row register for all 74 findings (40 operator, 34 public). The reviewed books are historical evidence and imply no repository commit. Current implementation was inspected on feat/surface-book-remediation at HEAD 7cc638c2589cfe412dc97fccc9b2dfe7aa4367a, with the dirty tree preserved. Separate current-build runtime findings RT-12–RT-14 are recorded in [runtime-findings.md](runtime-findings.md).

Each row preserves original severity, effort, finding, source/review pages, acceptance, surfaces, routes, baseline quality, and shared occurrences. It adds normalized actual files, a permitted disposition (accepted, alreadyresolved, rejected, or blocked), implementationStatus, evidence, decision, and remainingSeverity. All 74 rows are accepted and implemented; PE23.1 and PE26.1 are closed at remainingSeverity 0 by the verified account journeys. No independent review is claimed.

## Evidence and coverage

- Operator: 33/33 integrated surfaces at 1440×900 DPR2 on Korea fixture 79903f30-c9aa-4a95-86cf-cbfd0fbde500; display-token gaps are supplemented by evidence/operator/display-1920.png.
- Native supplements: evidence/operator/session-layout.png, roster-width.png, taipei-matches.png, controlled-preview.png, setup-failure-retry.png, backup-inspection.png, backup-restore-confirmation.png, and display-revoke-confirmation.png. The setup failure retry shows the retained draft, retry action, successful save, and restore.
- Public: 39 declared routes plus runtime player detail in the authoritative Tailscale capture; account journey evidence is under evidence/account-journey/.
- Surface inventory and retained per-surface baseline ledgers remain in surfaces.json, surfaces.md, and the workstream reports. findings.json retains all original baseline fields and decisions.
