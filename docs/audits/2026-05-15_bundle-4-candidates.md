# Bundle 4 candidates — audit follow-ups + spotted-during-walk items

**Filed**: 2026-05-15 (after Bundle 3 merge)
**Source**: original audit `2026-05-15_user-audit_meet-vs-bracket.md` deferred items + Bundle 1/2/3 reviewer follow-ups + Bundle 3 manual-walk spot finds.
**Status**: backlog. Not yet scoped into a spec. Pick what fits when a Bundle 4 brainstorm starts.

## Smaller polish items (from original audit §3)

- **TV Schedule + Standings view tabs are no-ops.** Either implement them or remove the buttons. Today both render the same Court-card layout as Courts. (Audit §1.7)
- **"Configure display" button on TV** navigates to Setup → Tournament instead of Setup → Public display. The `?section=display` query param is set on the URL but the Setup sidebar doesn't honor it on mount. (Audit §1.7)
- **Setup defaults aren't persisted until "Save tournament settings" clicked.** Operator navigates away → events table is empty. Suggest auto-save or a dirty-state indicator. (Audit §1.1)
- **Bracket Roster has no bulk-import textarea.** Meet has one; bracket forces one-by-one. (Audit §2.2)
- **Bracket Events row click only triggers expand from the "0 entered" cell.** Should expand from any column. (Audit §2.3)
- **Picker overflow on rightmost meet roster column (MS).** Player-search popover extends past viewport, half-clips the highlighted result. (Audit §1.3)
- **Sticky `RECONNECTING…` badge** on the TV header. Persists even when reads are working. Possible SSE/WebSocket dropout the UI surfaces but the data path doesn't actually depend on. (Audit §1.7)

## Spotted during Bundle 3 manual walk (2026-05-15)

- **Dashboard tournament-date display shows the day before.** A `2026-05-15` tournament reads `5/14/2026` in the dashboard list. Same off-by-one Bundle 1 fixed for the TV header (`formatTournamentDate` in `publicDisplay/helpers.ts`) — the dashboard uses a separate formatter (`TournamentListPage.tsx`) that still parses bare `YYYY-MM-DD` as UTC midnight then formats in the viewer's local zone. One-line fix: same `timeZone: 'UTC'` treatment.

## Open follow-ups from prior bundle reviews

### Bundle 1 (post-merge follow-ups from code-quality review)
- `useLiveTracking.updateMatchStatus` — on a 412+refetch-fails rollback, the version cache is left stale. Next mutation 412s again until the operator clicks Retry. Add `setMatchVersion(matchId, 0)` (or a dedicated `clearMatchVersion`) in the double-failure path so Retry succeeds on the first click.
- `useLiveTracking` — `updateMatchStatus`, `setMatchScore`, `confirmPlayer`, `useLiveOperations.updateActualTime` all repeat the same 9-line version-resolution block. Extract a `resolveMatchVersion(tid, matchId)` helper.
- `apiClient.updateMatchState` 412/409 path — interceptor pushes its own generic toast before our catch fires. Two toasts on the same conflict. Suggest `validateStatus: (s) => (s >= 200 && s < 300) || s === 412 || s === 409` to bypass the interceptor for those statuses; only the `MatchVersionMismatch` Retry toast surfaces.
- `updateMatchState.test.ts` — add coverage for the ETag-missing fallback (`headers: {}` → `version + 1`) and the interceptor-rewritten error shape (`{ status: 412 }` with no `response` field).

### Bundle 3 (post-merge follow-ups)
- `TabBar.tsx` onClick — `if (tid) { navigate(...) }` is dead-code because `useTournamentId()` throws before the guard runs. Either remove the guard or switch to `useTournamentIdOrNull()` and keep the guard as defensive code.

## Larger candidates (deferred, separate brainstorm)

- **Bracket Setup chrome parity.** Extend Bundle 2's pattern (header + content + sidebar) to the bracket Setup tab so its full-screen layout matches meet's Setup. Originally part of the user's "not everything is full screen" complaint; only the Schedule tab was addressed in Bundle 2.
- **Decompose `BracketTab` into per-route components.** Today `BracketTab` internally dispatches to its six sub-views; AppShell still has `if kind === 'bracket' ? <BracketTab /> : meet-tabs-dispatch`. Decomposing makes the dispatch pattern uniform but is a meaningful refactor — explicitly out of scope for Bundle 3 per the user's call.

## Notes on scoping

- The smaller polish items are mostly orthogonal — they can be picked à la carte for Bundle 4, or further split into Bundle 4a / 4b if the user wants finer-grained PRs.
- The dashboard-date item and the Configure-display item are both one-line query/format fixes. Natural pair if a "tiny fixes" bundle is the right shape.
- The Setup dirty-state, bracket Roster bulk-import, and bracket Events row-click are UX changes that benefit from brainstorming individually (each has implicit design choices: auto-save vs banner; reuse meet's bulk-import vs simpler form; what counts as "the row").
- The TV Schedule/Standings tabs are the biggest commitment — implementing them is real work; removing them is one-line UI cleanup. Decision-worthy before scoping.
