import { EmptyState } from '@scheduler/design-system/components';

interface BracketEmptyStateProps {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** The bracket module's editorial placeholder. The rendering is the design
 *  system's `EmptyState variant="editorial"` (ADR 0020); this wrapper keeps
 *  the module's historical prop API. */
export function BracketEmptyState({
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
}: BracketEmptyStateProps) {
  return (
    <EmptyState
      variant="editorial"
      eyebrow={eyebrow}
      title={title}
      body={body}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
