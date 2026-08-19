/**
 * ActionsBar — the universal top zone for a workspace surface.
 *
 * A 44px (`min-h-11`) bar that never scrolls and owns ALL page-level
 * controls; nothing that acts on the whole page lives in the content area
 * below it. Shared across every product module (Meet, Bracket, Operations,
 * Display) so the surfaces read as one design language.
 *
 * Layout: `[eyebrow title] [status] …auto margin… [controls]`.
 *   - `title`   — the page label, as the uppercase eyebrow.
 *   - `status`  — a count or status value shown beside the title.
 *   - children  — right-aligned page controls (buttons, search, etc.).
 *
 * IT WRAPS, IT DOES NOT CLIP. It was `h-11` + `shrink-0` controls + a
 * `flex-1` spacer, which at 768px produced two separate failures on Meet
 * Matches: the status text ("24 matches") overflowed its crushed `min-w-0`
 * box and printed 34px ON TOP of the search input, and the trailing control
 * ("Regenerate from roster") ended at x=794 against a 768px document — off
 * screen, with nothing to scroll and no way to reach it. A page-level
 * control that cannot be reached is a broken requirement, not a cosmetic
 * one: the console has to work at tablet width. So every group wraps and
 * the height is a MINIMUM. One row at desktop widths, two at tablet — and
 * never a hidden character (`truncationContract.test.ts`).
 *
 * Pair it with a `flex h-full min-h-0 flex-col` page root and a
 * `min-h-0 flex-1 overflow-auto` content region below so the bar stays
 * pinned while only the content scrolls.
 */
import type { ReactNode } from 'react';
import { EYEBROW_CLASS } from '../../lib/utils';

export function ActionsBar({
  title,
  status,
  children,
}: {
  title: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-card px-4 py-1.5">
      <span className={`shrink-0 ${EYEBROW_CLASS} text-muted-foreground`}>
        {title}
      </span>
      {status != null ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{status}</div>
      ) : null}
      {/* `ml-auto` rather than a `flex-1` spacer: with wrapping on, a spacer
          would eat the whole first line and leave the controls LEFT-aligned
          on the second. The auto margin right-aligns them on whichever line
          they land. */}
      {children != null ? (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      ) : null}
    </header>
  );
}
