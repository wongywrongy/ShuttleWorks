/**
 * Public Display Page — tournament status display for TVs, projectors,
 * and public viewing. Access via /display with optional query params:
 *
 *   ?view=courts (default) — current/called match on each court
 *   ?view=schedule        — upcoming matches
 *   ?view=standings       — school-vs-school leaderboard
 *
 * Designed to be readable from across a gym: oversized type, high
 * contrast, and a built-in fullscreen toggle so the operator can hit
 * F or a button to take over the display without F11 ceremony.
 *
 * The /display route mounts this page *outside* AppShell, so the
 * tournament-state hydrator (``useTournamentState``) is not in scope
 * here — we run a dedicated read-only polling loop below so the TV
 * stays fresh against the same backend without needing the operator
 * UI to be open.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { useAdvisories } from '../hooks/useAdvisories';
import { AdvisoryBanner } from '../components/status/AdvisoryBanner';
import { formatSlotTime } from '../lib/time';
import { INTERACTIVE_BASE } from '../lib/utils';
import type { ScheduleAssignment } from '../api/dto';
import { useDisplaySync } from './publicDisplay/useDisplaySync';
import { useFullscreen } from './publicDisplay/useFullscreen';
import { formatTournamentDate } from './publicDisplay/helpers';
import { FullscreenButton } from './publicDisplay/FullscreenButton';
import { LiveStatusPill } from './publicDisplay/LiveStatusPill';
import { ScheduleView } from './publicDisplay/ScheduleView';
import { StandingsView } from './publicDisplay/StandingsView';
import { CourtsView } from './publicDisplay/CourtsView';

type ViewMode = 'courts' | 'schedule' | 'standings';

export function PublicDisplayPage() {
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get('view') as ViewMode | null;
  const [view, setView] = useState<ViewMode>(viewParam || 'courts');
  const [now, setNow] = useState<Date>(() => new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { schedule, config, matches, matchStates, matchesByStatus } = useLiveTracking();
  const players = useAppStore((state) => state.players);
  const groups = useAppStore((state) => state.groups);

  // Standalone display surfaces critical advisories so spectators
  // (and any operator watching the TV) know a replan is imminent.
  // The hook is idempotent — when the page is embedded under
  // AppShell as the TV preview tab, the AppShell-level mount
  // already covers it; mounting again here is harmless.
  useAdvisories();

  // 1 Hz tick drives both the wall clock and the elapsed timer on active matches.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Read-only polling + liveness derivation. See ./publicDisplay/useDisplaySync.ts.
  const { liveStatus, syncError } = useDisplaySync(now);

  // Fullscreen toggle + F-key shortcut. See ./publicDisplay/useFullscreen.ts.
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);

  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const playerNames = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // Indexing helpers we'll reuse below. O(1) by-matchId lookups so the
  // courts / standings derivations don't re-scan the full matchesByStatus
  // array on every tick.
  const matchesByCourt = useMemo(() => {
    const active = new Map<number, string>();
    const called = new Map<number, string>();
    for (const a of matchesByStatus.started) {
      const courtId = matchStates[a.matchId]?.actualCourtId ?? a.courtId;
      active.set(courtId, a.matchId);
    }
    for (const a of matchesByStatus.called) {
      const courtId = matchStates[a.matchId]?.actualCourtId ?? a.courtId;
      if (!active.has(courtId)) called.set(courtId, a.matchId);
    }
    return { active, called };
  }, [matchesByStatus.started, matchesByStatus.called, matchStates]);

  // Get current match on each court (active > called > empty).
  const courtMatches = useMemo(() => {
    if (!schedule || !config) return [];
    type Row = {
      courtId: number;
      match: (typeof matches)[number] | null;
      state: (typeof matchStates)[string] | null;
      status: 'active' | 'called' | 'empty';
      // When ``status === 'empty'``, the next scheduled assignment for
      // this court (if any). Used by the public TV to render a
      // "Next: <event> at <time>" preview instead of an inert
      // "Available" placeholder.
      nextMatch?: (typeof matches)[number] | null;
      nextStartTime?: string;
    };
    const courts: Row[] = [];

    // Build a per-court list of *future* scheduled assignments, sorted
    // by slot ascending. ``schedule.assignments`` is the source of
    // truth for upcoming play; ``matchStates`` is consulted to skip
    // anything already finished or in progress.
    const futureByCourt = new Map<number, ScheduleAssignment[]>();
    for (let c = 1; c <= config.courtCount; c++) futureByCourt.set(c, []);
    for (const a of schedule.assignments) {
      const s = matchStates[a.matchId]?.status;
      if (s === 'finished' || s === 'started' || s === 'called') continue;
      const list = futureByCourt.get(a.courtId);
      if (list) list.push(a);
    }
    futureByCourt.forEach((list) => list.sort((x, y) => x.slotId - y.slotId));

    for (let courtId = 1; courtId <= config.courtCount; courtId++) {
      const activeId = matchesByCourt.active.get(courtId);
      if (activeId) {
        courts.push({
          courtId,
          match: matchMap.get(activeId) || null,
          state: matchStates[activeId] || null,
          status: 'active',
        });
        continue;
      }
      const calledId = matchesByCourt.called.get(courtId);
      if (calledId) {
        courts.push({
          courtId,
          match: matchMap.get(calledId) || null,
          state: matchStates[calledId] || null,
          status: 'called',
        });
        continue;
      }
      const next = futureByCourt.get(courtId)?.[0] ?? null;
      courts.push({
        courtId,
        match: null,
        state: null,
        status: 'empty',
        nextMatch: next ? matchMap.get(next.matchId) || null : null,
        nextStartTime: next ? formatSlotTime(next.slotId, config) : undefined,
      });
    }
    return courts;
  }, [schedule, config, matchesByCourt, matchMap, matchStates]);

  // Next 10 scheduled matches.
  const upcomingMatches = useMemo(() => {
    if (!schedule) return [];
    return matchesByStatus.scheduled.slice(0, 10).map((a) => ({
      assignment: a,
      match: matchMap.get(a.matchId),
    }));
  }, [matchesByStatus.scheduled, matchMap, schedule]);

  // School-vs-school standings (dual-meet friendly).
  const standings = useMemo(() => {
    const groupScores: Record<string, { wins: number; losses: number; matchesPlayed: number }> = {};
    groups.forEach((g) => (groupScores[g.id] = { wins: 0, losses: 0, matchesPlayed: 0 }));
    // Index players by id so the inner loop is O(1) instead of O(N) scans.
    const playerById = new Map(players.map((p) => [p.id, p]));
    matchesByStatus.finished.forEach((assignment) => {
      const match = matchMap.get(assignment.matchId);
      const state = matchStates[assignment.matchId];
      if (!match || !state?.score) return;
      const sideAGroupId = match.sideA?.map((id) => playerById.get(id)?.groupId).find(Boolean);
      const sideBGroupId = match.sideB?.map((id) => playerById.get(id)?.groupId).find(Boolean);
      if (!sideAGroupId || !sideBGroupId || sideAGroupId === sideBGroupId) return;
      const aWon = state.score.sideA > state.score.sideB;
      const bWon = state.score.sideB > state.score.sideA;
      if (groupScores[sideAGroupId]) {
        groupScores[sideAGroupId].matchesPlayed++;
        if (aWon) groupScores[sideAGroupId].wins++;
        if (bWon) groupScores[sideAGroupId].losses++;
      }
      if (groupScores[sideBGroupId]) {
        groupScores[sideBGroupId].matchesPlayed++;
        if (bWon) groupScores[sideBGroupId].wins++;
        if (aWon) groupScores[sideBGroupId].losses++;
      }
    });
    return Object.entries(groupScores)
      .map(([groupId, scores]) => ({
        groupId,
        groupName: groupNames.get(groupId) || groupId,
        ...scores,
      }))
      .filter((s) => s.matchesPlayed > 0)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  }, [matchesByStatus.finished, matchMap, matchStates, groups, groupNames, players]);


  // ===== Rendering =====================================================

  // ── Theme resolution ──────────────────────────────────────────
  // ``tvTheme`` lets the venue lock the public display to dark or
  // light independently of the operator's app theme. ``auto`` (or
  // unset) follows the app's current theme — read from the
  // ``.dark`` class that ``useAppliedTheme`` attaches to <html>.
  const tvTheme = config?.tvTheme ?? 'dark';
  const isDark = useMemo(() => {
    if (tvTheme === 'dark') return true;
    if (tvTheme === 'light') return false;
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
  }, [tvTheme, now]);
  const themeClass = isDark ? 'dark' : '';

  if (!schedule || !config) {
    return (
      <div
        ref={rootRef}
        className={`${themeClass} min-h-[100dvh] bg-background text-foreground flex items-center justify-center`}
      >
        <div className="absolute right-4 top-4 flex items-center gap-3">
          <LiveStatusPill status={liveStatus} error={syncError} />
          <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        </div>
        <div className="text-center">
          <div className="text-6xl font-bold tracking-tight">Tournament Display</div>
          <div className="mt-3 text-2xl text-muted-foreground">
            {liveStatus === 'live'
              ? 'No schedule generated yet'
              : 'Waiting for connection to the server…'}
          </div>
        </div>
      </div>
    );
  }

  const finishedCount = matchesByStatus.finished.length;
  const totalCount = schedule.assignments.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((finishedCount / totalCount) * 100);

  // Brutalist view tabs: square corners + 1px border, brand orange
  // border + tinted background on the active tab. Mono-uppercase keeps
  // them readable from across a gym while staying tight against the
  // surrounding telemetry chrome. shadcn-style rounded-lg + bg-primary
  // pill is banned by BRAND.md §3 + §1.10.
  const tabClass = (mode: ViewMode) =>
    [
      INTERACTIVE_BASE,
      'border px-4 py-2 text-base font-mono font-semibold uppercase tracking-wider',
      view === mode
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/40 hover:text-foreground',
    ].join(' ');

  // The director picks how courts render: tall strips, multi-column
  // grid, or one-line list. Stored on the tournament config so the
  // venue's setup stays consistent across reloads. The picker UI lives
  // in the Public-display settings card (admin TV tab) — never on the
  // standalone /display window.
  const tvDisplayMode: 'strip' | 'grid' | 'list' = config.tvDisplayMode ?? 'strip';

  // ---- TV theme + sizing knobs (per-tournament) -----------------------
  // Accent — hex string driving the LIVE border, LIVE pill, and the
  // bottom progress bar. Defaults to emerald (#10b981).
  const tvAccent = (config.tvAccent && /^#?[0-9a-fA-F]{6}$/.test(config.tvAccent.replace(/^#/, '')))
    ? (config.tvAccent.startsWith('#') ? config.tvAccent : `#${config.tvAccent}`)
    : '#10b981';
  // Background tone — only meaningful in dark mode. Light mode falls
  // through to the app's ``bg-background`` token.
  const tvBgTone = config.tvBgTone ?? 'navy';
  const TV_BG_DARK = {
    navy:     { bg: 'bg-slate-950',     header: 'bg-slate-950/90'     },
    black:    { bg: 'bg-black',         header: 'bg-black/90'         },
    midnight: { bg: 'bg-[#0a0e2a]',     header: 'bg-[#0a0e2a]/90'     },
    slate:    { bg: 'bg-slate-900',     header: 'bg-slate-900/90'     },
  } as const;
  const tvBgClass = isDark ? TV_BG_DARK[tvBgTone].bg : 'bg-background';
  const tvHeaderBgClass = isDark ? TV_BG_DARK[tvBgTone].header : 'bg-background/90';
  // Grid columns / card size / score visibility.
  const tvGridColumns = config.tvGridColumns ?? null;
  const tvCardSize = config.tvCardSize ?? 'auto';
  const tvShowScores = config.tvShowScores !== false;
  // Card size → height + matching type scale. Big cards get big text
  // so the audience can read every name from across a gym.
  const cardHeightPx =
    tvCardSize === 'compact' ? 72 :
    tvCardSize === 'comfortable' ? 128 :
    tvCardSize === 'large' ? 176 :
    isFullscreen ? 128 : 96;
  const sizeTier = cardHeightPx >= 160 ? 'xl' : cardHeightPx >= 120 ? 'lg' : cardHeightPx >= 96 ? 'md' : 'sm';
  // tracking-tighter on the giant court-number display — at 5xl-7xl the
  // default tracking reads as gappy across a gym; tightening pulls the
  // glyphs back into a single visual mass.
  const SIZES = {
    sm: { courtNum: 'text-3xl tracking-tight', eventCode: 'text-base', player: 'text-base', padX: 'px-4' },
    md: { courtNum: 'text-5xl tracking-tighter', eventCode: 'text-2xl', player: 'text-2xl', padX: 'px-4' },
    lg: { courtNum: 'text-6xl tracking-tighter', eventCode: 'text-3xl', player: 'text-3xl', padX: 'px-6' },
    xl: { courtNum: 'text-7xl tracking-tighter', eventCode: 'text-4xl', player: 'text-4xl', padX: 'px-6' },
  } as const;
  const { courtNum: courtNumSize, eventCode: eventCodeSize, player: playerSize, padX: cardPadX } = SIZES[sizeTier];

  // Grid columns. Tailwind safelist won't pick up dynamic class
  // names so we keep the literal strings; lookup beats a 4-deep
  // ternary at the callsite.
  const GRID_COLS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };
  const gridColsClass = (tvGridColumns && GRID_COLS[tvGridColumns]) || GRID_COLS[2];

  return (
    <div
      ref={rootRef}
      className={`${themeClass} min-h-[100dvh] ${tvBgClass} text-foreground selection:bg-primary/30`}
    >
      {/* Subtle film-grain overlay — adds a barely-there texture to the
          full-screen TV surface so the pure flats don't read as
          sterile. Fixed + pointer-events-none keeps it off the GPU's
          continuous-repaint path during scroll. Inline data-URL avoids
          a network request for the 100-byte SVG. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-modal opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      {/* Critical-only advisory banner (read-only on TV) */}
      <div className="px-6 pt-4 empty:hidden">
        <AdvisoryBanner readOnly />
      </div>
      {/* ---------- Header ------------------------------------------------ */}
      <div className={`sticky top-0 z-hud border-b border-border ${tvHeaderBgClass} px-6 py-4 backdrop-blur`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-4 min-w-0">
            <div className="text-3xl font-bold tracking-tight">Tournament Status</div>
            {formatTournamentDate(config.tournamentDate) && (
              <div className="text-base text-muted-foreground whitespace-nowrap">
                {formatTournamentDate(config.tournamentDate)}
              </div>
            )}
            <LiveStatusPill status={liveStatus} error={syncError} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setView('courts')} className={tabClass('courts')}>
                Courts
              </button>
              <button
                type="button"
                onClick={() => setView('schedule')}
                className={tabClass('schedule')}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => setView('standings')}
                className={tabClass('standings')}
              >
                Standings
              </button>
            </div>
            <div className="tabular-nums text-2xl text-muted-foreground">{currentTime}</div>
            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
          </div>
        </div>
      </div>

      <div className="px-6 pb-28 pt-6">
        {/* ---------- Courts view ---------- */}
        {view === 'courts' && (
          <CourtsView
            courts={courtMatches}
            config={config}
            now={now}
            displayMode={tvDisplayMode}
            gridColsClass={gridColsClass}
            cardHeightPx={cardHeightPx}
            cardPadX={cardPadX}
            courtNumSize={courtNumSize}
            eventCodeSize={eventCodeSize}
            playerSize={playerSize}
            tvAccent={tvAccent}
            tvShowScores={tvShowScores}
            isFullscreen={isFullscreen}
            playerNames={playerNames}
          />
        )}

        {/* ---------- Schedule view ---------- */}
        {view === 'schedule' && (
          <ScheduleView
            upcomingMatches={upcomingMatches}
            config={config}
            playerNames={playerNames}
          />
        )}

        {/* ---------- Standings view ---------- */}
        {view === 'standings' && <StandingsView standings={standings} />}
      </div>

      {/* ---------- Progress footer ------------------------------------- */}
      <div className={`fixed inset-x-0 bottom-0 border-t border-border ${tvHeaderBgClass} px-6 py-3 backdrop-blur`}>
        <div className="flex items-center justify-between text-base">
          <div className="text-muted-foreground">
            {finishedCount} / {totalCount} matches complete · {progressPct}%
          </div>
          <div className="flex items-center gap-5">
            <span
              className="inline-flex items-center gap-2"
              style={{ color: tvAccent }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tvAccent }}
              />
              {matchesByStatus.started.length} active
            </span>
            <span className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
              {matchesByStatus.called.length} called
            </span>
          </div>
        </div>
        {/* Track stays full-width; the fill animates via transform: scaleX
            so we never trip a layout reflow on the parent grid each tick. */}
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
        >
          <div
            className="h-full origin-left rounded-full transition-transform duration-500 ease-brand"
            style={{ transform: `scaleX(${progressPct / 100})`, backgroundColor: tvAccent }}
          />
        </div>
      </div>
    </div>
  );
}

