/**
 * The public-register empty state: friendly copy, exactly ONE action.
 *
 * For *result sets* only — an empty result of a real query is information.
 * An empty capability is a placeholder, and rule 4 keeps those off the page
 * by gating the surface itself (`visibleTabs`), never by rendering this.
 */
import { Button } from '@scheduler/design-system/components';

export function EmptyState({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action: { label: string; href: string };
}) {
  return (
    <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-rule-control p-8">
      <p className="text-base font-medium text-foreground">{heading}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Button asChild variant="outline" size="sm">
        <a href={action.href}>{action.label}</a>
      </Button>
    </div>
  );
}
