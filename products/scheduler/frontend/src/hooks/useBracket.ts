/**
 * Bracket polling hook — adapted from the tournament product's
 * ``useTournament``. Exposes the ``{ data, setData, loading, error,
 * refresh }`` shape the ported bracket components expect.
 *
 * ## Shared-per-tournament poll
 *
 * Several components on the bracket surface call ``useBracket``
 * independently (``BracketTabBody``, ``EventsTab``,
 * ``EventsFilterStrip`` …). A naive per-hook poll meant N concurrent
 * ``GET /tournaments/{tid}/bracket`` loops AND no propagation between
 * them — an event generated in ``EventsTab`` (which owns its own hook
 * instance) was invisible to ``BracketTabBody``'s instance until the
 * latter's next poll happened to fire. To fix both, every consumer of
 * the same ``tournamentId`` now subscribes to a single module-level
 * poll entry: one network loop, one shared ``data``, and a
 * ``setData`` from any consumer is observed by all of them.
 *
 * ## "No draw yet" — pause instead of poll-and-404
 *
 * Before a draw exists the endpoint 404s. ``apiClient.getBracket``
 * already accepts that 404 as a non-error (returns ``null``), so no
 * toast / ``console.error`` fires — but the browser still logs the
 * failed request to the devtools console every cycle. The only way to
 * silence that repeated network log is to stop issuing the request.
 * So when a poll resolves to ``null`` (no draw configured) we *pause*
 * the loop. It resumes when a draw appears — i.e. when any consumer
 * calls ``setData`` with a non-null DTO (the create/generate flow), or
 * on an explicit ``refresh`` (the per-view header's refresh button /
 * remount). Existence-checking inherently needs one request that may
 * 404; the goal is to eliminate the *repeated* noise, which this does.
 *
 * Realtime via Supabase ``postgres_changes`` remains a deliberate
 * follow-up; this hook still polls once a draw exists.
 */
import { useCallback, useEffect, useState } from 'react';
import { useBracketApi } from '../api/bracketClient';
import { isTerminalPollError } from '../lib/pollPolicy';
import { isPageHidden, subscribeVisibility } from '../lib/pageVisibility';
import { useTournamentId } from './useTournamentId';
import type { BracketTournamentDTO } from '../api/bracketDto';

const POLL_MS = 2500;

/** Bounded DTO — cheap to stringify at most once per poll tick (2.5s). */
function dtoEqual(a: BracketTournamentDTO | null, b: BracketTournamentDTO | null): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

type BracketGetFn = () => Promise<BracketTournamentDTO | null>;

interface PollEntry {
  data: BracketTournamentDTO | null;
  loading: boolean;
  error: string | null;
  /** ``Date.now()`` of the last data write (poll or setData). Gates the
   *  interval so a poll started just before a user action can't clobber
   *  the fresher DTO that action produced. */
  lastTouched: number;
  /** Latest tournament-bound ``api.get``; refreshed on each subscribe. */
  get: BracketGetFn;
  timer: ReturnType<typeof setInterval> | null;
  /** True while paused on a "no draw yet" (null) result. */
  paused: boolean;
  /** Guards against overlapping fetches on the shared entry. */
  inFlight: boolean;
  refcount: number;
  subscribers: Set<() => void>;
  /** Cached ``readSnapshot`` result — reused (same object) while `data`,
   *  `loading`, and `error` are all unchanged, so React's `setState` bails
   *  on reference equality instead of re-rendering every consumer on
   *  every poll tick. */
  lastSnapshot: { data: BracketTournamentDTO | null; loading: boolean; error: string | null } | null;
}

// Keyed by tournamentId so every consumer of the same tournament shares
// one poll loop + one data snapshot.
const registry = new Map<string, PollEntry>();

function ensureEntry(tid: string, get: BracketGetFn): PollEntry {
  let e = registry.get(tid);
  if (!e) {
    e = {
      data: null,
      loading: false,
      error: null,
      lastTouched: 0,
      get,
      timer: null,
      paused: false,
      inFlight: false,
      refcount: 0,
      subscribers: new Set(),
      lastSnapshot: null,
    };
    registry.set(tid, e);
  }
  return e;
}

function notify(e: PollEntry): void {
  for (const cb of e.subscribers) cb();
}

function ensureInterval(e: PollEntry): void {
  e.paused = false;
  if (e.timer == null) {
    e.timer = setInterval(() => {
      // Nobody can see the update while the tab is hidden — skip the
      // network roundtrip entirely rather than fetch-and-discard.
      if (isPageHidden()) return;
      if (Date.now() - e.lastTouched >= POLL_MS - 100) void runFetch(e);
    }, POLL_MS);
  }
}

// Module-level, process-lifetime subscription: on visibility regain, wake
// every entry that is actively polling (has a live timer) and is NOT
// semantically paused. `paused` covers both "no draw yet" (404) and
// "terminal error" (deleted workspace / access revoked) — either way a
// regain must not resurrect the exact storm those pauses exist to kill.
subscribeVisibility((hidden) => {
  if (hidden) return;
  for (const e of registry.values()) {
    if (!e.paused && e.timer != null) void runFetch(e);
  }
});

function pause(e: PollEntry): void {
  e.paused = true;
  if (e.timer != null) {
    clearInterval(e.timer);
    e.timer = null;
  }
}

function stop(e: PollEntry): void {
  e.paused = false;
  if (e.timer != null) {
    clearInterval(e.timer);
    e.timer = null;
  }
}

async function runFetch(e: PollEntry): Promise<void> {
  if (e.inFlight) return;
  e.inFlight = true;
  // The loading spinner is only meaningful for the FIRST load. Once we
  // already have data, a poll tick is a silent background refresh — flip
  // `loading` (and notify) here only when there's nothing on screen yet.
  const isInitialLoad = e.data == null;
  if (isInitialLoad) {
    e.loading = true;
    // Deliberately NOT clearing e.error here: wiping it at fetch start made
    // a terminal "workspace no longer available" notice flicker away on
    // every resumed tick. The success path below sets it to null; a failure
    // overwrites it — either way the outcome, not the attempt, decides.
    notify(e);
  }
  try {
    const d = await e.get();
    e.lastTouched = Date.now();
    // Content-guard: an unchanged DTO keeps the OLD reference so every
    // subscriber's snapshot stays reference-identical and React bails on
    // the re-render. Only replace `data` when the content actually moved.
    if (!dtoEqual(d, e.data)) e.data = d;
    e.error = null;
    if (d == null) {
      // No draw configured yet — pause to stop the repeated 404 network
      // log. ``setData`` (create/generate) or ``refresh`` resumes us.
      pause(e);
    } else {
      ensureInterval(e);
    }
  } catch (err) {
    if (isTerminalPollError(err)) {
      // Terminal: the tournament was deleted or our access was revoked —
      // retrying every 2.5s can never succeed and just storms the console
      // with 403s. Pause the loop and surface a human answer; a manual
      // `refresh` re-checks if the operator believes otherwise.
      e.error =
        'This workspace is no longer available — it may have been deleted or your access removed.';
      pause(e);
    } else {
      // Real network / server failure (the shared axios interceptor already
      // toasted, deduped). Keep the loop running so it self-heals once the
      // backend recovers — a transient error must not strand live updates.
      e.error = err instanceof Error ? err.message : String(err);
      ensureInterval(e);
    }
  } finally {
    e.loading = false;
    e.inFlight = false;
    notify(e);
  }
}

function readSnapshot(tid: string): {
  data: BracketTournamentDTO | null;
  loading: boolean;
  error: string | null;
} {
  const e = registry.get(tid);
  if (!e) return { data: null, loading: false, error: null };
  const last = e.lastSnapshot;
  if (last != null && last.data === e.data && last.loading === e.loading && last.error === e.error) {
    // Nothing observable changed since the last read — return the SAME
    // object so a consumer's `setSnap(readSnapshot(tid))` is a no-op
    // reference-equal write and React skips the re-render.
    return last;
  }
  const snap = { data: e.data, loading: e.loading, error: e.error };
  e.lastSnapshot = snap;
  return snap;
}

export function useBracket() {
  const api = useBracketApi();
  const tid = useTournamentId();
  const [snap, setSnap] = useState(() => readSnapshot(tid));

  const setData = useCallback(
    (next: BracketTournamentDTO | null) => {
      const e = ensureEntry(tid, api.get);
      e.get = api.get;
      e.data = next;
      e.lastTouched = Date.now();
      e.error = null;
      // A draw now exists -> resume live polling; a reset (null) -> pause
      // so we don't immediately 404 again on the next tick.
      if (next != null) ensureInterval(e);
      else pause(e);
      notify(e);
    },
    [tid, api.get],
  );

  const refresh = useCallback(async () => {
    const e = ensureEntry(tid, api.get);
    e.get = api.get;
    await runFetch(e);
  }, [tid, api.get]);

  useEffect(() => {
    const e = ensureEntry(tid, api.get);
    e.get = api.get;
    e.refcount += 1;
    const cb = () => setSnap(readSnapshot(tid));
    e.subscribers.add(cb);
    // Sync this consumer to the current shared snapshot immediately.
    cb();
    // Drive the shared loop: first-ever load fetches once; an already
    // populated entry just (re)starts the interval; a PAUSED entry stays
    // quiet until an explicit wake (setData / refresh). The paused check
    // matters for the terminal pause (deleted workspace): that entry
    // retains its last good DTO, so gating on data alone restarted the
    // doomed poll on every resubscribe.
    if (e.paused) {
      // stay quiet
    } else if (e.lastTouched === 0) {
      void runFetch(e);
    } else if (e.data != null) {
      ensureInterval(e);
    }
    return () => {
      e.subscribers.delete(cb);
      e.refcount -= 1;
      if (e.refcount <= 0) {
        // Last consumer left the bracket surface — stop the loop and drop
        // the entry so a fresh mount re-checks from scratch (preserves the
        // "poll stops when you leave the module" property).
        stop(e);
        registry.delete(tid);
      }
    };
  }, [tid, api.get]);

  return {
    data: snap.data,
    setData,
    loading: snap.loading,
    error: snap.error,
    refresh,
  };
}
