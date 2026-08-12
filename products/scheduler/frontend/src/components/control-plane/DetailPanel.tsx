/**
 * DetailPanel — the shared right-hand detail pane chrome.
 *
 * Two variants:
 *  - `docked` (pair with `DetailDock`): fills its host, no positioning of
 *    its own. The table beside it stays fully visible and interactive, so
 *    the pane does NOT close on outside clicks — operators click row to row
 *    and the pane follows. Dismissed by Esc or the × button; row re-click
 *    toggles it shut (consumer-owned). `role="complementary"`.
 *  - `overlay` (legacy/fallback): a floating layer pinned to the right edge
 *    of the nearest `relative` ancestor, `sw-drawer-in` entry. Dismissed by
 *    Esc, outside mousedown, or ×. `role="dialog"`.
 *
 * The header carries the `[EYEBROW] Value · sub` identity line; everything
 * below is consumer-supplied `children` — the panel has no opinion about
 * content. To animate row-to-row content switches, `key` the panel (or its
 * children) by the selected id — poll ticks then don't re-fire the entry.
 *
 * Extracted from Meet's roster DetailDrawer (SP-D7 S1) so Bracket roster
 * and both Matches surfaces can dock the same drawer.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { EYEBROW_CLASS } from '../../lib/utils';

export function DetailPanel({
  label,
  value,
  sub,
  mono = false,
  onClose,
  children,
  width = 'w-[380px]',
  testId = 'detail-panel',
  variant = 'docked',
}: {
  /** Uppercase context eyebrow, e.g. "Position", "Player", "Match". */
  label: string;
  /** Primary heading — a code ("MS1") or a name. */
  value: string;
  /** Optional muted context after the heading (e.g. the event label). */
  sub?: string;
  /** Render the heading in the mono face (true for rank/event codes). */
  mono?: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Width utility class for the OVERLAY variant (default `w-[380px]`).
   *  Ignored when docked — `DetailDock` owns geometry there. */
  width?: string;
  testId?: string;
  /** `docked` (default) fills a DetailDock host and never closes on
   *  outside clicks; `overlay` floats over content with outside-mousedown
   *  dismissal — the standalone escape hatch for surfaces with no dock. */
  variant?: 'docked' | 'overlay';
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const docked = variant === 'docked';

  // Focus-stealing is OVERLAY-only (a dialog covering content should own
  // focus). Docked panes never take focus: consumers key the panel by the
  // selected id (fresh state per selection), so any mount-time focus()
  // would re-fire on EVERY row-to-row click and yank focus out of the
  // table. Esc works regardless — its listener is on the document.
  useEffect(() => {
    if (!docked) ref.current?.focus();
  }, [docked, value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // An open inner layer (Radix Select/Popover portals its content and
      // owns this Esc) must close itself, not the pane.
      if (e.defaultPrevented) return;
      if (
        e.target instanceof Element &&
        e.target.closest('[data-radix-popper-content-wrapper]')
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    if (docked) {
      return () => document.removeEventListener('keydown', onKey);
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose, docked]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      role={docked ? 'complementary' : 'dialog'}
      aria-label={`${label} ${value}`}
      tabIndex={-1}
      className={
        docked
          ? 'flex h-full w-full min-w-0 flex-col bg-card text-foreground outline-none'
          : `absolute inset-y-0 right-0 z-overlay flex ${width} max-w-[90%] flex-col border-l border-border bg-card text-foreground shadow-2xl outline-none sw-drawer-in`
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className={`${EYEBROW_CLASS} text-muted-foreground`}>
            {label}
          </span>
          <span
            className={[
              'text-sm font-semibold text-foreground',
              mono ? 'sw-num' : '',
            ].join(' ')}
          >
            {value}
          </span>
          {sub ? (
            <span className="min-w-0 break-words text-xs text-muted-foreground">{sub}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted/60 hover:text-foreground"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
