import { Button } from '@scheduler/design-system';

interface BracketEmptyStateProps {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function BracketEmptyState({
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
}: BracketEmptyStateProps) {
  return (
    <section className="mx-auto flex min-h-[280px] max-w-3xl flex-col justify-center px-6 py-10">
      <div className="border-t border-border pt-5">
        <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-2 max-w-[58ch] text-sm leading-6 text-muted-foreground">
          {body}
        </p>
        {actionLabel && onAction ? (
          <div className="mt-5">
            <Button type="button" variant="brand" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
