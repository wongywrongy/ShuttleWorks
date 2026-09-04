/**
 * Top-bar status chip + popover.
 *
 * Replaces the standalone "Idle/Solving" pill. The chip doubles as a
 * trigger: clicking it opens a small panel showing backend health, the
 * schema version, the data directory path, the last-save timestamp, and
 * one-click actions for creating an ad-hoc backup or jumping to the
 * Setup-tab BackupPanel. Designed so the operator never has to open a
 * terminal on tournament day.
 */
import { useEffect, useRef, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { BRAND } from '@scheduler/brand';
import { useUiStore } from '../store/uiStore';
import { useCreateBackup } from '../hooks/useTournamentBackups';
import { useDeepHealth } from '../hooks/useDeepHealth';
import { INTERACTIVE_BASE } from '../lib/utils';

const HEALTH_POLL_INTERVAL_MS = 30_000;

export function AppStatusPopover() {
  const isGenerating = useUiStore((s) => s.isGenerating);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const persistStatus = useUiStore((s) => s.persistStatus);
  const lastSavedAt = useUiStore((s) => s.lastSavedAt);
  const pushToast = useUiStore((s) => s.pushToast);

  const [open, setOpen] = useState(false);
  const {
    health,
    error: healthError,
    restricted: healthRestricted,
    refresh: refreshHealth,
  } = useDeepHealth();
  const { createBackup, busy: backingUp } = useCreateBackup();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Solver-finished celebration: when isGenerating flips false after
  // having been true, replay the ``solution-tick`` keyframe on the chip
  // by remounting the dot (key bump). Pure cosmetic; no functional
  // dependency. ``prevGenerating`` lets us detect the rising edge of
  // "just finished".
  const prevGenerating = useRef(isGenerating);
  const [tickKey, setTickKey] = useState(0);
  useEffect(() => {
    if (prevGenerating.current && !isGenerating) {
      setTickKey((k) => k + 1);
    }
    prevGenerating.current = isGenerating;
  }, [isGenerating]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Refresh when the popover opens + poll every 30s while open.
  useEffect(() => {
    if (!open) return;
    void refreshHealth();
    const t = window.setInterval(() => void refreshHealth(), HEALTH_POLL_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [open, refreshHealth]);

  const handleBackupNow = async () => {
    const res = await createBackup();
    pushToast(
      res.created
        ? { level: 'success', message: 'Backup created', detail: res.filename }
        : {
            level: 'info',
            message: 'Nothing to back up yet',
            detail: 'Save a tournament first.',
          },
    );
  };

  // Status chip — wired to the semantic ``status-*`` tokens. Idle carries NO
  // label (SP-CONSOLE-REFINE G1): a resting solver is not something the
  // operator needs told about, and the bare "● Idle" chip read as ambiguous
  // chrome. The chip speaks only when there is something to say — Solving /
  // Degraded — and otherwise shrinks to a quiet dot that keeps the App-status
  // popover reachable.
  const chipLabel = isGenerating ? 'Solving' : health?.status === 'degraded' ? 'Degraded' : null;
  const chipTone = isGenerating
    ? 'bg-status-warning-bg text-status-warning border border-status-warning/40'
    : health?.status === 'degraded'
      ? 'bg-status-blocked-bg text-status-blocked border border-status-blocked/40'
      // Color budget: idle is NOT a success — neutral muted dot.
      // Green is reserved for success/complete/live-play.
      : 'bg-status-idle-bg text-text-muted border border-border';
  const chipDot = isGenerating
    ? 'bg-status-warning animate-pulse'
    : health?.status === 'degraded'
      ? 'bg-status-blocked'
      : 'bg-text-muted';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="app-status-chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={chipLabel ?? 'App status'}
        title="App status"
        className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold ${chipTone} hover:brightness-95`}
      >
        <span
          key={tickKey}
          className={`h-2 w-2 rounded-full ${chipDot} ${tickKey > 0 && !isGenerating ? 'motion-safe:animate-solution-tick' : ''}`}
          aria-hidden="true"
        />
        {chipLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="App status"
          data-testid="app-status-popover"
          className="absolute right-0 top-full z-popover mt-1 w-72 rounded border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-popover-foreground">App status</span>
            <button
              type="button"
              onClick={() => void refreshHealth()}
              className={`${INTERACTIVE_BASE} rounded border border-border px-2 py-0.5 text-3xs text-muted-foreground hover:bg-muted/40 hover:text-foreground`}
              aria-label="Refresh health"
            >
              Refresh
            </button>
          </div>

          {healthError && (
            <div className="mb-2 rounded border border-status-danger-fg/30 bg-status-danger-bg px-2 py-1 text-status-danger-fg">
              {healthError}
            </div>
          )}

          <dl className="space-y-1 text-muted-foreground">
            <Row label="Backend">
              {health ? (
                <span className={health.status === 'healthy' ? 'text-status-success-fg' : 'text-status-danger-fg'}>
                  {health.status} · v{health.version}
                </span>
              ) : healthRestricted ? (
                // Not a failure: this deployment keeps operational
                // detail off the browser. Saying "unreachable" here
                // would report an outage that isn't happening.
                <span className="text-muted-foreground">not published</span>
              ) : healthError ? (
                <span className="text-status-danger-fg">unreachable</span>
              ) : (
                <span className="text-muted-foreground">checking…</span>
              )}
            </Row>
            {/* Operator-first labels — the diagnostics stay, the internals
                jargon ("Schema", "Solver loaded", "Data dir") doesn't. */}
            <Row label="Data format">{health ? `v${health.schemaVersion}` : '–'}</Row>
            <Row label="Scheduler">
              {health
                ? (health.solverLoaded ? 'ready' : <span className="text-status-danger-fg">unavailable</span>)
                : '–'}
            </Row>
            <Row label="Data folder">
              {health
                ? (health.dataDirWritable ? 'writable' : <span className="text-status-danger-fg">read-only</span>)
                : '–'}
            </Row>
            <Row label="Last save">
              {persistStatus === 'error' ? (
                <span className="text-status-danger-fg">failed</span>
              ) : lastSavedAt ? (
                new Date(lastSavedAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              ) : persistStatus === 'saving' ? (
                'saving…'
              ) : (
                '–'
              )}
            </Row>
          </dl>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleBackupNow}
              disabled={backingUp}
              data-testid="app-status-backup"
              aria-busy={backingUp}
              className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-2 py-0.5 text-2xs text-card-foreground hover:bg-muted/40 hover:text-foreground`}
            >
              {backingUp ? 'Backing up…' : 'Back up now'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('setup');
                setOpen(false);
              }}
              className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-2xs text-card-foreground hover:bg-muted/40 hover:text-foreground`}
            >
              Manage backups
              <CaretRight aria-hidden="true" className="h-3 w-3" />
            </button>
          </div>

          <p className="mt-2 text-3xs text-muted-foreground">
            To quit {BRAND.productName}, close its launcher window (or run the Stop
            script).
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}
