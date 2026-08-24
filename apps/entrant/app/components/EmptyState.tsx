/**
 * The public-register empty state: friendly copy, at most ONE action.
 *
 * For *result sets* only — an empty result of a real query is information.
 * An empty capability is a placeholder, and rule 4 keeps those off the page
 * by gating the surface itself (`visibleTabs`), never by rendering this.
 *
 * **A card, not a dashed outline (SP-P7 §3.8).** The dashed border is the
 * drop-target/placeholder idiom, which says "something is missing here" — the
 * opposite of what an empty result set means. Every other block of content on
 * this tier is a card (`SectionCard`, `SeasonCalendar`), so the dashed variant
 * also read as a different KIND of thing rather than a quieter one.
 *
 * `action` is optional, and that is what lets a page use this container
 * instead of a bare `<p>` when there is genuinely nothing to offer. Discovery
 * with no listings at all is the case: nothing to clear, nowhere to send
 * anyone, but still an empty state rather than a sentence in whitespace.
 */
import { Button } from '@scheduler/design-system/components';

export function EmptyState({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="grid justify-items-start gap-3 rounded-lg border border-rule-soft bg-surface-raised p-8 shadow-sm">
      <p className="text-base font-medium text-foreground">{heading}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action ? (
        <Button asChild variant="outline" size="sm">
          <a href={action.href}>{action.label}</a>
        </Button>
      ) : null}
    </div>
  );
}
