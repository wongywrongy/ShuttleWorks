/**
 * MeetActionsBar — the universal top zone for every Meet page.
 *
 * A fixed 44px (`h-11`) bar that never scrolls, sits between the
 * workspace shell chrome and the page content, and owns ALL page-level
 * controls. Nothing that acts on the whole page lives in the content
 * area below it.
 *
 * Layout: `[eyebrow title] [status] …spacer… [controls]`.
 *   - `title`   — the page label, as the uppercase eyebrow.
 *   - `status`  — a count or status value shown beside the title.
 *   - children  — right-aligned page controls (buttons, search, etc.).
 *
 * Pair it with a `flex h-full min-h-0 flex-col` page root and a
 * `min-h-0 flex-1 overflow-auto` content region below so the bar stays
 * pinned while only the content scrolls.
 */
import type { ReactNode } from 'react';

export function MeetActionsBar({
  title,
  status,
  children,
}: {
  title: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </span>
      {status != null ? (
        <div className="flex min-w-0 items-baseline gap-2">{status}</div>
      ) : null}
      <div className="flex-1" />
      {children != null ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}
