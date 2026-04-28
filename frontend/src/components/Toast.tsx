/**
 * In-app toast stack.
 *
 * Reads the ``toasts`` slice from the app store. Errors are sticky by
 * default; info/success/warn auto-dismiss after their ``durationMs``.
 * Each toast has an accessible ``role`` — ``alert`` for errors, ``status``
 * for everything else — so screen readers announce them without the user
 * needing to focus the stack.
 */
import { useEffect, type ComponentType } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideProps } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Toast as ToastEntry, ToastLevel } from '../store/appStore';
import { INTERACTIVE_BASE, INTERACTIVE_BASE_QUIET } from '../lib/utils';

const LEVEL_STYLES: Record<
  ToastLevel,
  { bg: string; border: string; text: string; Icon: ComponentType<LucideProps> }
> = {
  info:    { bg: 'bg-status-started-bg', border: 'border-status-started/40', text: 'text-status-started', Icon: Info },
  success: { bg: 'bg-status-live-bg',    border: 'border-status-live/40',    text: 'text-status-live',    Icon: CheckCircle2 },
  warn:    { bg: 'bg-status-warning-bg', border: 'border-status-warning/40', text: 'text-status-warning', Icon: AlertTriangle },
  error:   { bg: 'bg-status-blocked-bg', border: 'border-status-blocked/40', text: 'text-status-blocked', Icon: XCircle },
};

function Item({ toast }: { toast: ToastEntry }) {
  const dismiss = useAppStore((s) => s.dismissToast);
  const styles = LEVEL_STYLES[toast.level];
  const role = toast.level === 'error' ? 'alert' : 'status';
  const { Icon } = styles;

  // Auto-dismiss timer (null means sticky — typically errors).
  useEffect(() => {
    if (toast.durationMs == null) return;
    const t = window.setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.durationMs, dismiss]);

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      data-testid={`toast-${toast.level}`}
      className={`flex min-w-[16rem] max-w-md items-start gap-2 rounded-lg border ${styles.bg} ${styles.border} ${styles.text} px-3 py-2 shadow-sm`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 text-xs leading-snug">
        <div>{toast.message}</div>
        {toast.detail && (
          <div className="mt-0.5 text-[10px] opacity-70 truncate">{toast.detail}</div>
        )}
      </div>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            dismiss(toast.id);
          }}
          className={`${INTERACTIVE_BASE} rounded border border-current bg-card px-2 py-0.5 text-[11px] font-semibold hover:bg-card/90`}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        className={`${INTERACTIVE_BASE_QUIET} flex h-6 w-6 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-black/5`}
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  // bottom-14 keeps toasts clear of the SolverHud (which sits at bottom-0
  // on Schedule). z-50 stays above the HUD's z-10 either way.
  return (
    <div
      data-testid="toast-stack"
      className="pointer-events-none fixed bottom-14 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Item toast={t} />
        </div>
      ))}
    </div>
  );
}
