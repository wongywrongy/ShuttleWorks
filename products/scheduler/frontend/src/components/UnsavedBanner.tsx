/**
 * "Unsaved changes" banner.
 *
 * Shows only when the last save errored OR when edits have been pending
 * for longer than ``STALE_MS`` (30 s) without the debounced flush firing
 * — which in practice only happens if the backend goes away mid-session.
 *
 * The banner is mounted inside AppShell so it's visible on every tab.
 */
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { forceSaveNow } from '../hooks/useTournamentState';

const STALE_MS = 30_000;

export function UnsavedBanner() {
  const persistStatus = useAppStore((s) => s.persistStatus);
  const lastSaveError = useAppStore((s) => s.lastSaveError);
  const [dirtyForTooLong, setDirtyForTooLong] = useState(false);
  const [saving, setSaving] = useState(false);

  // Start a 30 s timer each time we enter the dirty state; clear it when
  // we leave. If the timer fires we surface the banner.
  useEffect(() => {
    if (persistStatus !== 'dirty') {
      setDirtyForTooLong(false);
      return;
    }
    const t = window.setTimeout(() => setDirtyForTooLong(true), STALE_MS);
    return () => window.clearTimeout(t);
  }, [persistStatus]);

  const isError = persistStatus === 'error';
  const visible = isError || dirtyForTooLong;
  if (!visible) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await forceSaveNow();
    } catch {
      // forceSaveNow already set the error state; nothing to do here.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="unsaved-banner"
      role={isError ? 'alert' : 'status'}
      className={`flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-xs ${
        isError
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-status-warning/40 bg-status-warning-bg text-status-warning'
      }`}
    >
      <span className="font-medium">
        {isError
          ? `Couldn't save to the server${lastSaveError ? ` — ${lastSaveError}` : '.'}`
          : 'You have unsaved changes.'}
      </span>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        data-testid="unsaved-save-now"
        className="rounded border border-current/40 bg-card px-2.5 py-0.5 text-xs font-semibold hover:bg-card/80 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save now'}
      </button>
    </div>
  );
}
