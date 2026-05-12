/**
 * Hint — dismissable inline advisory.
 *
 * Each hint has a stable `id` whose dismissal is persisted to
 * `localStorage` so a director only sees it once. Visually it reads as a
 * subtle border-left advisory — small info icon, text, × close — not a
 * card or banner.
 *
 * Use sparingly: a hint is for the *one* thing about a surface that
 * isn't self-evident from the affordances. Form-field constraint
 * messages and validation errors don't belong here.
 *
 * The `useHint` hook form returns `[shouldShow, dismiss, reset]` for
 * cases where the caller wants control over render placement (e.g., in
 * a dialog header).
 *
 * The default tone is "info" (blue-tinted). "subtle" reads as muted
 * helper text without the blue accent.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Info, X } from '@phosphor-icons/react';

import { cn, INTERACTIVE_BASE_QUIET } from '../lib/utils';

const STORAGE_KEY = 'scheduler-dismissed-hints';

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Storage unavailable (private mode, quota); drop silently.
  }
}

export function useHint(id: string): [boolean, () => void, () => void] {
  const [dismissed, setDismissed] = useState<boolean>(() =>
    loadDismissed().has(id)
  );
  // Re-check on mount in case localStorage was updated by a sibling
  // surface that mounted before this one.
  useEffect(() => {
    setDismissed(loadDismissed().has(id));
  }, [id]);

  const dismiss = () => {
    const set = loadDismissed();
    set.add(id);
    saveDismissed(set);
    setDismissed(true);
  };
  const reset = () => {
    const set = loadDismissed();
    set.delete(id);
    saveDismissed(set);
    setDismissed(false);
  };
  return [!dismissed, dismiss, reset];
}

interface HintProps {
  id: string;
  children: ReactNode;
  /** `subtle` reads as muted helper text. `info` (default) adds a faint
   *  blue background tint for the rare hint that needs to register. */
  variant?: 'subtle' | 'info';
  className?: string;
}

export function Hint({ id, children, variant = 'info', className }: HintProps) {
  const [show, dismiss] = useHint(id);
  if (!show) return null;

  const tone =
    variant === 'subtle'
      ? 'border border-border/70 bg-muted/40 text-foreground/90'
      : 'border border-blue-300/70 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100';
  const iconTone =
    variant === 'subtle'
      ? 'text-muted-foreground'
      : 'text-blue-600 dark:text-blue-300';

  return (
    <div
      role="note"
      className={cn(
        'flex w-full items-start gap-2 rounded-sm border-l-2 px-2.5 py-1.5 text-xs leading-snug',
        variant === 'info'
          ? 'border-l-blue-500 dark:border-l-blue-400'
          : 'border-l-border',
        tone,
        className
      )}
    >
      <Info
        aria-hidden="true"
        className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', iconTone)}
      />
      <span className="flex-1">{children}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss hint"
        title="Dismiss"
        className={cn(
          INTERACTIVE_BASE_QUIET,
          '-mr-1 rounded-sm p-0.5 hover:bg-foreground/10',
          iconTone
        )}
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
