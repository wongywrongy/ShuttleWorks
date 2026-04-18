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
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { useAppStore } from '../store/appStore';

interface DeepHealth {
  status: 'healthy' | 'degraded';
  version: string;
  schemaVersion: number;
  dataDirWritable: boolean;
  solverLoaded: boolean;
  dataDirError: string | null;
  solverError: string | null;
  requestId: string | null;
}

async function fetchDeepHealth(): Promise<DeepHealth> {
  // Deliberately hits the raw fetch so a 503/timeout here doesn't blast
  // the global toast stack — the popover surfaces failure inline.
  const base = import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? '/api' : 'http://localhost:8000');
  const res = await fetch(`${base}/health/deep`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export function AppStatusPopover() {
  const isGenerating = useAppStore((s) => s.isGenerating);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const persistStatus = useAppStore((s) => s.persistStatus);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const pushToast = useAppStore((s) => s.pushToast);

  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<DeepHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const refreshHealth = useCallback(async () => {
    setHealthError(null);
    try {
      setHealth(await fetchDeepHealth());
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Health check failed');
      setHealth(null);
    }
  }, []);

  // Refresh when the popover opens + poll every 30s while open.
  useEffect(() => {
    if (!open) return;
    void refreshHealth();
    const t = window.setInterval(() => void refreshHealth(), 30_000);
    return () => window.clearInterval(t);
  }, [open, refreshHealth]);

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const res = await apiClient.createTournamentBackup();
      if (res.created) {
        pushToast({
          level: 'success',
          message: 'Backup created',
          detail: res.filename ?? undefined,
        });
      } else {
        pushToast({
          level: 'info',
          message: 'Nothing to back up yet',
          detail: 'Save a tournament first.',
        });
      }
    } finally {
      setBackingUp(false);
    }
  };

  const chipLabel = isGenerating ? 'Solving' : health?.status === 'degraded' ? 'Degraded' : 'Idle';
  const chipTone = isGenerating
    ? 'bg-amber-50 text-amber-700'
    : health?.status === 'degraded'
      ? 'bg-red-50 text-red-700'
      : 'bg-emerald-50 text-emerald-700';
  const chipDot = isGenerating
    ? 'bg-amber-500 animate-pulse'
    : health?.status === 'degraded'
      ? 'bg-red-500'
      : 'bg-emerald-500';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="app-status-chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${chipTone} hover:brightness-95`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${chipDot}`} />
        {chipLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="App status"
          data-testid="app-status-popover"
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded border border-gray-200 bg-white p-3 text-xs shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-gray-700">App status</span>
            <button
              type="button"
              onClick={() => void refreshHealth()}
              className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
              aria-label="Refresh health"
            >
              Refresh
            </button>
          </div>

          {healthError && (
            <div className="mb-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-red-700">
              {healthError}
            </div>
          )}

          <dl className="space-y-1 text-gray-600">
            <Row label="Backend">
              {health ? (
                <span className={health.status === 'healthy' ? 'text-emerald-700' : 'text-red-700'}>
                  {health.status} · v{health.version}
                </span>
              ) : healthError ? (
                <span className="text-red-700">unreachable</span>
              ) : (
                <span className="text-gray-400">checking…</span>
              )}
            </Row>
            <Row label="Schema">{health ? `v${health.schemaVersion}` : '—'}</Row>
            <Row label="Solver">
              {health
                ? (health.solverLoaded ? 'loaded' : <span className="text-red-700">missing</span>)
                : '—'}
            </Row>
            <Row label="Data dir">
              {health
                ? (health.dataDirWritable ? 'writable' : <span className="text-red-700">read-only</span>)
                : '—'}
            </Row>
            <Row label="Last save">
              {persistStatus === 'error' ? (
                <span className="text-red-700">failed</span>
              ) : lastSavedAt ? (
                new Date(lastSavedAt).toLocaleTimeString()
              ) : persistStatus === 'saving' ? (
                'saving…'
              ) : (
                '—'
              )}
            </Row>
          </dl>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleBackupNow}
              disabled={backingUp}
              data-testid="app-status-backup"
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {backingUp ? 'Backing up…' : 'Back up now'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('setup');
                setOpen(false);
              }}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
            >
              Manage backups →
            </button>
          </div>

          <p className="mt-2 text-[10px] text-gray-400">
            To quit, close the launcher terminal window or run the Stop script.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-700">{children}</dd>
    </div>
  );
}
