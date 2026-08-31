import type { ReactNode } from 'react';
import { cn } from '@scheduler/design-system/lib/utils';

/**
 * DialogFooter — the action row at the bottom of a modal or dialog panel.
 *
 * Two explicit variants, matching the two footer treatments that were
 * hand-copied across modules (settings, hub, bracket, operations):
 *
 * - `between`: confirm-style modal footer — actions spread to the edges
 *   (Cancel left, commit right), separated from the body by margin alone.
 * - `end`: panel/dialog footer — actions right-aligned above a hairline
 *   top rule (the operations-plan dialogs).
 *
 * Container only: buttons keep their own styling at the call site.
 */
const ALIGN_CLASS = {
  between: 'mt-6 flex justify-between',
  end: 'flex justify-end gap-2 border-t border-border pt-2',
} as const;

export function DialogFooter({
  align = 'end',
  className,
  children,
}: {
  align?: keyof typeof ALIGN_CLASS;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(ALIGN_CLASS[align], className)}>{children}</div>;
}
