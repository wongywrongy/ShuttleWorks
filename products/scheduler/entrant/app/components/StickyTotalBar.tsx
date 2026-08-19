/**
 * The sticky total bar (Z14): bottom bar on phones, sticky side rail from
 * `lg:` up. It lives INSIDE the entry form — its buttons are plain submit
 * controls, one carrying `formAction` at the quote route (Z13), one posting
 * the form's own submit action. With no JS the bar cannot live-update as
 * boxes tick, so it says what it is: the LAST-QUOTED state from the echo
 * (`totalBarState`), with an "Update total" affordance. The total is always
 * the server's (R14/Seam B); nothing here computes.
 *
 * Refinement 3 (Phase B sign-off): the nearest deadline is restated inside
 * the bar — the one fact a hesitating entrant needs at the moment of
 * submission.
 *
 * `id="total"` is the G0 landing: the quote 307 answers
 * `/e/{slug}/enter[/signed-in]?…#total`, so the round trip scrolls back to
 * the number it just changed.
 */
import { Button, Notice } from '@scheduler/design-system/components';

import { formatMoment } from '../lib/format';
import { formatCents } from '../lib/money';
import { chipLabel, type ChipState, type TotalBarState } from '../lib/phase';

export function StickyTotalBar({
  state,
  chip,
  deadline,
  quoteAction,
}: {
  state: TotalBarState;
  chip: ChipState;
  /** The nearest `closesAt` over open events (raw wire string), or null. */
  deadline: string | null;
  quoteAction: string;
}) {
  return (
    <section
      id="total"
      aria-label="Total and submit"
      // E5: slimmer on a phone, where this used to cost about a third of the
      // screen. `p-3` and a 2-up button row below `lg:`; in the 18rem side
      // rail from `lg:` up there is room, so it goes back to `p-4` and
      // stacked. Nothing is hidden at either width — the same four facts are
      // on the bar.
      //
      // 2026-08-11 design audit, finding #3: `position: sticky; bottom: 0`
      // engages the moment its containing block (this `<form>`) exceeds the
      // viewport height — which one default player block already does at
      // 390px — so the bar was pinned from initial paint, not just on final
      // scroll, covering ~21% of the viewport for the whole journey and
      // clipping the "Club (optional)" field before typing. Native CSS
      // cannot defer *when* a bottom-sticky element engages without content
      // to fill that gap, so this takes the finding's other option: read as
      // a DELIBERATE bottom sheet rather than an accidental one — tighter
      // `p-2.5`/`gap-1.5`, and `shadow-frame` (the design system's own
      // overlay-elevation token) instead of the card-weight `shadow-lg`.
      // `lg:shadow-sm` is untouched: the side rail sits beside content, not
      // over it, so it was never the overlay this addresses.
      className="sticky bottom-0 grid gap-1.5 rounded-t-lg border border-rule-soft bg-surface-raised p-2.5 shadow-frame lg:bottom-auto lg:top-6 lg:gap-3 lg:rounded-lg lg:p-4 lg:shadow-sm"
    >
      {state.kind === 'quoted' ? (
        <div className="flex items-baseline justify-between gap-4 lg:block">
          <p className="text-sm text-muted-foreground">
            Quoted total ·{' '}
            <span className="tabular-nums">
              {`${state.eventCount} ${state.eventCount === 1 ? 'event' : 'events'}`}
            </span>
          </p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {formatCents(state.totalCents)}
          </p>
        </div>
      ) : state.kind === 'refused' ? (
        <Notice tone="warning">{state.copy}</Notice>
      ) : (
        <p className="text-sm text-muted-foreground">
          Prices are per event; bundles are cheaper. Press &ldquo;Update total&rdquo; to
          see what this selection comes to.
        </p>
      )}
      {/* Refinement 3: the nearest deadline, restated where the decision is
          made. `chipLabel` carries the countdown; the moment names the day. */}
      <p className="text-xs text-muted-foreground">
        {chipLabel(chip)}
        {chip.kind === 'entriesOpen' && deadline !== null
          ? ` · ${formatMoment(deadline)}`
          : ''}
      </p>
      {/* Side by side on a phone — two stacked full-width buttons were the
          single biggest slice of the bar's height. Stacked again in the side
          rail, where 18rem is too narrow to share. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <Button
          type="submit"
          name="action"
          value="filter"
          variant="outline"
          formAction={quoteAction}
          formNoValidate
        >
          Update total
        </Button>
        <Button type="submit" variant="brand">
          Submit entry
        </Button>
      </div>
      <p className="text-xs leading-tight text-muted-foreground">
        The total is the organizer&rsquo;s quote and is confirmed on your receipt.
      </p>
    </section>
  );
}
