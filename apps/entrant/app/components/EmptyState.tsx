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
 *
 * The rendering is the design system's `EmptyState variant="card"`
 * (ADR 0020, byte-identical to the markup this file used to inline); this
 * wrapper keeps the tier's prop API and this docblock.
 */
import { EmptyState as DSEmptyState } from '@scheduler/design-system/components';

export function EmptyState({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return <DSEmptyState variant="card" heading={heading} body={body} action={action} />;
}
