/**
 * Toast — sticky notification primitive (data-source agnostic).
 *
 * The rendering split: `<Toast>` is the individual card; `<ToastStack>`
 * is the bottom-right fixed positioner. Neither knows about your app's
 * queue — pass `toasts` + `onDismiss` from wherever your state lives
 * (Zustand, Redux, useReducer, ...).
 *
 * Auto-dismiss is handled per-toast based on `durationMs`. Errors
 * default to sticky (no auto-dismiss); the data layer can override.
 *
 * Accessibility: role="alert" for errors (assertive announce),
 * role="status" for everything else (polite announce).
 */
import { useEffect, type ComponentType } from 'react';
import {
  Warning,
  CheckCircle,
  Info,
  X,
  XCircle,
  type IconProps,
} from '@phosphor-icons/react';

import { cn, INTERACTIVE_BASE, INTERACTIVE_BASE_QUIET } from '../lib/utils';

export type ToastLevel = 'info' | 'success' | 'warn' | 'error';

export interface ToastData {
  id: string;
  level: ToastLevel;
  message: string;
  detail?: string;
  /** Milliseconds before auto-dismiss. `null` or `undefined` = sticky. */
  durationMs?: number | null;
  actionLabel?: string;
  onAction?: () => void;
}

const LEVEL_STYLES: Record<
  ToastLevel,
  { bg: string; border: string; text: string; Icon: ComponentType<IconProps> }
> = {
  info:    { bg: 'bg-status-started-bg', border: 'border-status-started/40', text: 'text-status-started', Icon: Info },
  success: { bg: 'bg-status-live-bg',    border: 'border-status-live/40',    text: 'text-status-live',    Icon: CheckCircle },
  warn:    { bg: 'bg-status-warning-bg', border: 'border-status-warning/40', text: 'text-status-warning', Icon: Warning },
  error:   { bg: 'bg-status-blocked-bg', border: 'border-status-blocked/40', text: 'text-status-blocked', Icon: XCircle },
};

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const styles = LEVEL_STYLES[toast.level];
  const role = toast.level === 'error' ? 'alert' : 'status';
  const { Icon } = styles;

  // Auto-dismiss timer (null means sticky — typically errors).
  useEffect(() => {
    if (toast.durationMs == null) return;
    const t = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      data-testid={`toast-${toast.level}`}
      className={cn(
        'relative flex min-w-[16rem] max-w-md items-start gap-2 overflow-hidden border px-3 py-2 pointer-events-auto',
        styles.bg,
        styles.border,
        styles.text
      )}
    >
      {/* One-shot sheen on success — the "saved / committed" moment
          deserves a beat of celebration. Other levels stay quiet. */}
      {toast.level === 'success' ? (
        <div className="sheen-overlay motion-reduce:hidden" aria-hidden />
      ) : null}
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 text-xs leading-snug">
        <div>{toast.message}</div>
        {toast.detail && (
          <div className="mt-0.5 text-[10px] opacity-70 truncate">
            {toast.detail}
          </div>
        )}
      </div>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDismiss(toast.id);
          }}
          className={cn(
            INTERACTIVE_BASE,
            'rounded-sm border border-current bg-card px-2 py-0.5 text-[11px] font-semibold hover:bg-card/90'
          )}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className={cn(
          INTERACTIVE_BASE_QUIET,
          'flex h-6 w-6 items-center justify-center rounded-sm opacity-60 hover:opacity-100 hover:bg-black/5'
        )}
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ToastStackProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

/**
 * Bottom-right fixed stack. Renders nothing when there are no toasts so
 * the surface stays out of the way. `bottom-14` clears typical solver-
 * HUD chrome that pins to `bottom-0`.
 */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      data-testid="toast-stack"
      className="pointer-events-none fixed bottom-14 right-4 z-modal flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
