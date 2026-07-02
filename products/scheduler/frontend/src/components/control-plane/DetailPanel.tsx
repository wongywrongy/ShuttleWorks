/**
 * DetailPanel — the shared right-docked detail drawer chrome.
 *
 * A floating overlay pinned to the right edge of its nearest `relative`
 * ancestor: absolute, full-height, hairline `border-l`, `animate-block-in`
 * entry. Dismissed by Esc, clicking outside, or the × button. The header
 * carries the `[EYEBROW] Value · sub` identity line; everything below is
 * consumer-supplied `children` — the panel has no opinion about content.
 *
 * Extracted from Meet's roster DetailDrawer (SP-D7 S1) so Bracket roster
 * and both Matches surfaces can dock the same drawer.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

export function DetailPanel({
  label,
  value,
  sub,
  mono = false,
  onClose,
  children,
  width = 'w-[380px]',
  testId = 'detail-panel',
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
  /** Width utility class for the panel (default `w-[380px]`). */
  width?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Focus the panel on open so Esc + screen readers land here.
  useEffect(() => {
    ref.current?.focus();
  }, [value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      role="dialog"
      aria-label={`${label} ${value}`}
      tabIndex={-1}
      className={`absolute inset-y-0 right-0 z-overlay flex ${width} max-w-[90%] flex-col border-l border-border bg-card text-foreground shadow-2xl outline-none animate-block-in`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
            <span className="truncate text-xs text-muted-foreground">{sub}</span>
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
