import type { ReactNode } from 'react';
import { EmptyState as DSEmptyState } from '@scheduler/design-system/components';

/** A centered empty/zero-state: a title, optional body, and an optional CTA in
 *  the `action` slot (e.g. a "Create workspace" button). The rendering is the
 *  design system's `EmptyState variant="centered"` (ADR 0020); this wrapper
 *  keeps the console's historical prop API. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return <DSEmptyState variant="centered" title={title} body={body} action={action} />;
}
