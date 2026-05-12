/**
 * Accessible modal primitive.
 *
 * Renders the standard backdrop + centred panel with:
 *   - role="dialog" + aria-modal="true" + aria-labelledby
 *   - Escape closes (with cleanup)
 *   - Backdrop click closes (stopPropagation inside the panel)
 *   - Initial focus moves to the panel on mount
 *   - A focus trap keeps Tab within the panel
 *   - On unmount, focus is restored to the element that opened it
 *
 * Callers pass ``titleId`` matching the id of the visible heading inside
 * ``children`` so screen readers name the dialog correctly. All dialogs
 * in the app should go through this primitive so styling + ARIA stay
 * consistent.
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  titleId: string;
  children: ReactNode;
  /** Tailwind max-width class, e.g. "max-w-lg". Defaults to max-w-md. */
  widthClass?: string;
  /** Disable close-on-Escape / close-on-backdrop. Useful for critical flows. */
  locked?: boolean;
  /** Applied to the panel. Defaults match the app's dialog style. */
  panelClassName?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  onClose,
  titleId,
  children,
  widthClass = 'max-w-md',
  locked = false,
  panelClassName,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Initial focus + restore on unmount.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Defer focus so the panel is mounted before we ask for it.
    const raf = window.requestAnimationFrame(() => {
      const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
      (focusable && focusable.length ? focusable[0] : panel)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      previouslyFocused.current?.focus?.();
    };
  }, []);

  // Escape + focus trap on Tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"
      onClick={locked ? undefined : onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={
          panelClassName ??
          // BRAND.md §3 + §6 — square corners + 1px border + the
          // canonical hard-offset shadow (`--shadow-hard`, light mode
          // only; dark mode drops to bare substrate elevation).
          // Previously `rounded-lg shadow-xl` which fought with the
          // rest of the brutalist chrome.
          `w-full ${widthClass} border border-border bg-card shadow-[var(--shadow-hard)] focus:outline-none`
        }
      >
        {children}
      </div>
    </div>
  );
}
