# Manual smoke walkthrough — proposal pipeline + director tools

End-to-end checklist for verifying the dynamic replan / disruption
work in a real browser. Run after backend + frontend builds succeed
(`make run` or the equivalent dev workflow). Programmatic coverage of
the same ground lives in `src/tests/test_proposal_pipeline_integration.py`;
this document is for the parts that are easier to feel than to assert.

## Prereqs

1. Backend running on `http://localhost:8000` (`uvicorn app.main:app --reload`
   from `backend/`, or `make run`).
2. Frontend dev server on `http://localhost:5173` (`npm run dev` from
   `frontend/`).
3. Empty `data/` directory (or reset via the Setup tab) so the smoke
   starts clean.

## 1. Tournament setup → schedule

1. Open `http://localhost:5173`.
2. **Setup tab**: tournament date `today`, day 09:00–17:00, interval
   30 min, 3 courts, default rest 30 min.
3. **Roster tab**: add 2 schools (e.g., "School A" / "School B") and
   8 players, 4 per school, all with rank `MS`.
4. **Matches tab**: click the visual match generator → 4 matches
   (one MS pairing per round).
5. **Schedule tab** → **Generate**. Wait for the solver HUD to settle.
   ✅ The schedule appears, the lock indicator turns on, and the
   right rail shows "Details / Log / Candidates".

## 2. Strong-confirm modal at the lock boundary

1. Stay on the Setup tab and try to change the court count from 3 → 4.
2. ✅ A real **modal** appears (NOT a `window.confirm`) titled
   *"Discard committed schedule?"* with a Cancel button focused first
   and a *"Discard committed schedule"* destructive button second.
3. Click Cancel.
4. ✅ Court count stays at 3, schedule is intact.
5. Try again, click *"Discard committed schedule"*.
6. ✅ Schedule clears, lock indicator turns off, court count is
   editable. Re-generate before continuing.

## 3. Disruption proposal → review → commit

1. **Live tab**: pick the first scheduled match, click into the right
   rail's match details, click the *"Court closed"* row action (or
   open the **Repair after disruption** button).
2. Pick `Court closed` for court 1.
3. Click **Preview impact**.
4. ✅ The dialog body switches to the `ScheduleDiffView`:
   - Summary line with move count + affected schools
   - Move list with color-coded direction pills
   - Metric pills (objective delta, rest violations, etc.)
   - Per-school breakdown (collapsed by default)
5. Click **Cancel**.
6. ✅ The committed schedule is unchanged on the Gantt.
7. Re-trigger the dialog → **Preview impact** → **Commit repair**.
8. ✅ The Gantt updates, scheduleVersion bumps (verify in devtools:
   `localStorage.getItem('scheduler-storage')` or the Network tab on
   the next `/tournament/state` GET), a history entry is appended.

## 4. Warm-restart proposal

Same flow as §3 but starting from the **Re-plan…** button:

1. Click **Re-plan…** on the Schedule page.
2. Pick **Balanced** weight.
3. Click **Preview impact** → review diff → **Commit replan**.
4. ✅ Schedule changes, version bumps, history grows.

## 5. Live advisory toast + Live banner

1. **Live tab**: mark match #1 as **Called** (right rail action), wait
   ~3 minutes, then mark **Started** (or use the dev console to PUT
   `match-states/m1` with `status: "started"` and a `actualStartTime`
   timestamp 50 min in the past).
2. Wait up to 15 s for the next advisory poll.
3. ✅ A toast appears: *"Match #1 has run N min over its expected
   30-min duration"*, with a **Review** button.
4. ✅ The Live tab now shows an `AdvisoryBanner` above the Gantt with
   the same message and a Review CTA.
5. Click Review.
6. ✅ The disruption dialog opens **pre-filled** with type=`overrun`,
   matchId=`m1`, extraMinutes set to the detected delay.
7. Preview → Commit. Banner clears once advisory is no longer
   actionable.

## 6. Director tools — delay start

1. **Live tab** → **Director** button (top-right).
2. ✅ A modal opens with three sections: Delay start, Insert break,
   Active blackouts (only when one exists).
3. **Delay start**: enter 25 minutes, click **Preview…**.
4. ✅ The proposal review modal opens. Move list is **empty** (no
   matches move). Summary mentions *"clock shifts +25 min"*. Metric
   pills show no objective change.
5. Click **Commit**.
6. ✅ Persisted state shows `config.clockShiftMinutes = 25`. Every
   wall-clock display (Gantt, Live workflow, TV preview) reflects the
   shift.

## 7. Director tools — insert break

1. **Director** modal → **Insert break**.
2. Enter `12:00` to `13:00`, reason "Lunch", click **Preview…**.
3. ✅ Proposal review shows the matches that move out of the noon
   window, with their new slots in the move list.
4. Commit.
5. ✅ `config.breaks` gains a `{ start: "12:00", end: "13:00" }`
   entry. The new schedule respects the lunch window.

## 8. Director tools — remove break

1. **Director** modal → Active blackouts list shows the lunch entry.
2. Click the × next to it.
3. ✅ Proposal review shows the matches that pull forward into the
   freed window.
4. Commit. `config.breaks` is empty again.

## 9. Optimistic concurrency

1. Open two browser windows on the same tournament.
2. In window A: Re-plan… → Preview impact (don't commit yet).
3. In window B: Re-plan… → Preview impact → **Commit replan**.
4. Back in window A: click **Commit replan**.
5. ✅ Toast: sticky red error explaining the schedule advanced from
   version 0 to 1, prompting re-review. The proposal is dropped from
   memory. Window A's schedule view is now stale and should refetch.

## 10. Public TV display banner

1. Open `/display` in a separate tab (or fullscreen).
2. Inject a critical advisory by simulating a long overrun on a started
   match (see §5).
3. ✅ The TV display shows a red read-only banner *"Schedule update
   may be required — operator action pending"* at the very top,
   without any Review button (TV is read-only by design).

## 11. History rolling cap

1. Run §3 or §4 a total of 7 times.
2. After the 7th commit, GET `/tournament/state` (devtools or `curl`).
3. ✅ `scheduleVersion === 7`, `scheduleHistory.length === 5` (oldest
   two dropped).

## What this does NOT cover (intentionally)

- **DragGantt floating "Commit move?" bar** — the drag-drop flow still
  uses the legacy immediate-resolve path. Migrating it to the proposal
  pipeline is a separate UX change tracked as a follow-up.
- **Background continuous optimizer (Course C)** — out of scope; the
  current advisor is poll-based, not push-based.
- **Multi-worker uvicorn deployment** — the in-memory proposal store
  on `app.state` is single-worker only. Multi-worker would need Redis
  or similar.
