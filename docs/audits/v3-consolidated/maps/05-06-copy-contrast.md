# Code map — packages 05 (false claims) and 06 (contrast + hierarchy)

Produced 2026-09-06 by an Explore subagent; orchestrator-reviewed. Line numbers are baseline f5ccfcef.

## Part A — copy claims vs backend truth

### A1 Staff privacy
- Copy: `apps/console/src/modules/setup/SetupProduct.tsx:404-409` ("The current public site does not display staff details; the Public checkbox preserves publication intent…"). Nav `workspaceNav.ts:329`, label `SetupProduct.tsx:62`.
- Truth: `apps/api/src/workspaces/setup.py:161-172` `Contact`; no public serializer reads `contacts` (`entries_public.py:21`, `entries_site.py:670`, `display/display.py`).
- Contradiction: `setup.py:260` declares downstream impact `["operator contacts", "public contact details"]` rendered by `modules/setup/DownstreamImpact.tsx` (mounted `SetupProduct.tsx:780`). Verdict: paragraph true; "public contact details" false; `public` checkbox inert.

### A2 Module disabling
- Copy: `modules/settings/ModulesSettingsTab.tsx:24-35, 49-51`; `ModuleCatalogRow.tsx:110-114, 121-126 ("Off; existing data preserved"), 176-181 ("No data will be removed here.")`; `moduleCatalog.ts:26-46`.
- Truth: `apps/api/src/workspaces/workspace_modules.py:95-200` — PATCH writes status/config only; `_module_has_data` 207-219 → 409 `MODULE_HAS_DATA`; last-operational guard 186-194; display dependency 165-174.
- Verdict: all true. Gap: the hidden-from-navigation consequence is stated nowhere.

### A3 Local saves / sync / backups
- Copy `modules/settings/SyncBackupsTab.tsx`: 177 "Sync is active/needs attention"; **180 "Changes made here are saved locally and reconciled with the cloud when connected."**; **185 "Cloud copy up to date"**; 188 "{n} committed locally · awaiting cloud"; 196; backups 190-193, 279-289, 372-377 (true); toasts 84/105/121 (true). `SyncReconciliationPanel.tsx:69-71, 79-82`.
- Data: `hooks/useAuthorityStatus.ts` (5 s poll), `hooks/useTournamentBackups.ts`.
- Truth: `apps/api/src/sync/routes.py:477-503`, `sync/reconciliation.py:130-165` counts `SyncOutbox`; outbox written only by `sync/operation_log.py:84`, which no console write path calls. Uploader `sync/agent.py` is an opt-in process needing `SYNC_AUTHORITY_CAPABILITY_FILE`, `SYNC_TOURNAMENT_ID`, `SHUTTLEWORKS_NODE_ID` (not in any Compose stack). CLAUDE.md: single-store, no replication.
- Verdict: 180 false; 185 false (green with empty outbox); 177 unverifiable (epoch-lease state, not transfer state).

### A4 Entrant account copy
| file:line | string | verdict |
|---|---|---|
| `routes/verify.tsx:108-110` | "Any entries you already sent are now with the organizer." | true (`entries/lifecycle.py:125-145`) |
| `verify.tsx:142-148, 173-178` | "A fresh confirmation link has been sent…" / delivery hints | **unverified**: `identity/entrants_routes.py:515-531 _mail` swallows exceptions; `core/config.py:302 email_backend="console"` logs only |
| `routes/resetPassword.tsx:108` | "We will email you a link…" | unverified |
| `resetPassword.tsx:147-150` | "…a reset link is on its way. It is good for one hour." | hedged; "one hour" hardcoded over `settings.reset_token_ttl_minutes` |
| `resetPassword.tsx:199-202, 215-218` | password set / link unusable | true |
| `routes/login.tsx:271-274` | "Your entrant account is ready." on `/e/login/created` | reached by identical 303 for created and existing (`entrants_routes.py:653-660`); deliberately ambiguous |
| `routes/enter.tsx:333` | "We email them an invitation. Nothing is entered in their name until they accept" | first clause unverified (`entries_json.py:170-205` swallows); second true |
| `routes/partner.tsx:148,154,269`, `myEntries.tsx:36-39`, `receipt.tsx:163-166`, `discovery.tsx:113`, `signup.tsx:207-211` | | true |
Central fact: `apps/api/src/core/email.py:60-95` + `core/config.py:302`; both mail wrappers discard delivery failure.

### A5 Preview / import / editable-later
- `modules/hub/NewWorkspacePage.tsx:213-214` ("You can name it later", "date can be changed later in Setup") — true (Setup editable unless `authority === 'domain'`, `SetupProduct.tsx:627`). No "editable in Plan" claim exists.
- Import: only `meet/roster/RosterTab.tsx:722-770` (real).
- Preview: `display/DisplayProduct.tsx:42,77,88` live iframe (real); `workspace/displayConfig/DisplayPreview.tsx:174-187` sample-data mock labelled as such.

## Part B — contrast and hierarchy

### B1 Tokens
`packages/design-system/tokens.css` (light 280-300; dark 455-475; type ladder 203-217: 3xs 10px, 2xs 11px, xs 12px, 2sm 13px, sm 14px). `tailwind-preset.js:50-200`.
Light text: `--text-primary #111827` (283), `--text-secondary #374151` (284), `--text-muted #5C6470` (285), `--ink-faint` aliased to muted (316), `--ink-2 #1C222B` (314), `--action-primary #2563EB` (300), status fg 306-313. Surfaces `#EFF2F5 / #F9FAFB / #FFFFFF`.
Opacity fading forbidden by `tokens.css:28-30` and `DESIGN.md:18`. Violations: `components/ActiveChoice.tsx:70`; `hub/HubPage.tsx:89` (`text-current opacity-75` on accent, 11px → ≈3:1); `control-plane/MatchStatusFilter.tsx:54` (same); `components/MatchChip.tsx:146`; `bracket/DrawView.tsx:1401,1559`; `operations/run/RunFinished.tsx:91`; `meet/roster/positionGrid/PositionCell.tsx:83,95`; `display/publicDisplay/CourtsView.tsx:115,142,275,292,456`; `meet/roster/RosterTab.tsx:591`; `control-plane/OverflowMenu.tsx:111`; `bracket/BracketInlineNotice.tsx:28`; `design-system/components/Button.tsx:13` (`disabled:saturate-0`); `Toast.tsx:97`. Counts: console `opacity-` 97, `disabled:opacity` 57, `*-foreground/N` 6.

### B2 Names in muted ink
- Entrant canonical owner: `apps/entrant/public/assets/person-ref.js:38-41` — unlinked name `text-muted-foreground`; twin `app/components/PersonRef.tsx:16-31` (pinned by `tests/uiTwins.test.ts`). `PersonGroup.tsx:27,36`. `MatchCard.tsx:53` names primary, 64 loser scores muted, 110/116/126 bands. Lists: `EntrantsList.tsx:113,125`, `routes/draw.tsx:197,222`, `routes/schedule.tsx:296`.
- Console: `components/MatchChip.tsx:46,106,137,139,146`; `control-plane/MatchCard.tsx:116` primary but **:196 stacked variant mutes the loser's name**; `bracket/DrawView.tsx:1516-1523` loser slot muted, 558-570 list rows muted, 1401 coords.

### B3 Small tracked labels
Shared: `design-system/components/textStyles.ts:29 EYEBROW_CLASS` (2xs uppercase tracking); `StatusPill.tsx:68` (3xs); `StatusBar.tsx:66`; `GanttTimeline.tsx:340`; `Badge.tsx:31-32`; `Toast.tsx:97,111,125`. Console: `control-plane/BandedList.tsx:38`, `DenseDataTable.tsx:119,518,574,662` (3xs ink-faint), `matchStatus.tsx:83,86`, `PhaseStepper.tsx:47`, `MatchCard.tsx:80,121,187`, `MatchInspector.tsx:142`; ladder `lib/utils.ts:57-62`. Entrant `app/lib/ui.ts:52 EYEBROW` (xs). Counts: console `text-2xs` 167, `text-3xs` 63, `text-[10px]` 4, `text-[11px]` 2; entrant `text-2xs` 4, `text-3xs` 0.

### B4 Existing tests / how to compute contrast
- `packages/design-system/scripts/check-contrast.mjs` — WCAG gate over tokens.css (own hsl→rgb + luminance math, not exported). `npm run test:contrast` / `test:classes` — **not in `make check` or CI**.
- No WCAG helper in node_modules; extract the script's math into an importable module.
- Design-rule tests: `apps/console/src/platform/contracts/__tests__/selectedContrastContract.test.ts` (+ accent/copy/emDash/motion/truncation/module contracts). Entrant: `tests/noRawColor.test.ts`, `tests/uiTwins.test.ts`.
- Prose rules: `DESIGN.md:15-18`, `tokens.css:28-30`, `DESIGN_COLOR.md`, `docs/audits/surface-book-remediation/design-contract.md`, ADR 0020.
