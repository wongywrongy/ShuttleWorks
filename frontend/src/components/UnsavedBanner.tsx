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
      className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs ${
        isError
          ? 'border-red-300 bg-red-50 text-red-800'
          : 'border-yellow-300 bg-yellow-50 text-yellow-800'
      }`}
    >
      <span>
        {isError
          ? `Couldn't save to the server${lastSaveError ? ` — ${lastSaveError}` : '.'}`
          : 'You have unsaved changes.'}
      </span>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        data-testid="unsaved-save-now"
        className={`rounded border px-2 py-0.5 text-xs ${
          isError
            ? 'border-red-400 bg-white text-red-700 hover:bg-red-100'
            : 'border-yellow-400 bg-white text-yellow-700 hover:bg-yellow-100'
        } disabled:opacity-50`}
      >
        {saving ? 'Saving…' : 'Save now'}
      </button>
    </div>
  );
}
