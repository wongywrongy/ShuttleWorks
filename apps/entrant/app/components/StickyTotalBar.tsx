/**
 * The sticky total bar (Z14): bottom bar on phones, sticky side rail from
 * `lg:` up. It lives INSIDE the entry form, its buttons are plain submit
 * controls, one carrying `formAction` at the quote route (Z13), one posting
 * the form's own submit action. With no JS the bar cannot live-update as
 * boxes tick, so it says what it is: the LAST-QUOTED state from the echo
 * (`totalBarState`), with an "Update total" affordance. The total is always
 * the server's (R14/Seam B); nothing here computes.
 *
 * Refinement 3 (Phase B sign-off): the nearest deadline is restated inside
 * the bar, the one fact a hesitating entrant needs at the moment of
 * submission.
 *
 * Public refinement 2026-09-12: the bar now also carries the organizer's
 * fee schedule (the "How the total is calculated" disclosure) and the
 * per-person caps, which used to sit in a separate context card at the top
 * of the page — the price and the rule that makes it belong beside the
 * number, not above the form. Amounts print WITH the organizer's currency
 * when they stated one; when they did not, the quoted figure is called an
 * amount rather than a total and one plain line says the currency is not
 * stated. The old "Currency: Not configured" diagnostic is gone: it named
 * a configuration, not a fact an entrant could act on. `entry-wizard.js`
 * marks the bar `data-quote-stale` when the selection changes after a
 * quote, and fills `data-quote-status`; with no script the server's
 * `reviewedQuote` check refuses a stale quote at submit anyway.
 *
 * `id="total"` is the G0 landing: the quote 307 answers
 * `/e/{slug}/enter[/signed-in]?…#total`, so the round trip scrolls back to
 * the number it just changed.
 */
import { Button, Notice } from '@scheduler/design-system/components';

import { formatDateTimeInZone } from '../lib/format';
import { formatMoney } from '../lib/money';
import { chipLabel, type ChipState, type TotalBarState } from '../lib/phase';

export function StickyTotalBar({
  state,
  chip,
  deadline,
  timeZone,
  quoteAction,
  feeCurrency,
  feeTiers = [],
  capsLine = null,
}: {
  state: TotalBarState;
  chip: ChipState;
  /** The nearest `closesAt` over open events (raw wire string), or null. */
  deadline: string | null;
  /** The tournament's own zone, the deadline is CONVERTED into it (P7),
   * never printed as the wire's UTC instant with a zone suffix. */
  timeZone: string;
  quoteAction: string;
  /** The organizer's stated currency (ISO-4217), or null when unstated. */
  feeCurrency?: string | null;
  /** The bundle schedule, `[events per player, cents]`, sorted. */
  feeTiers?: readonly [string, number][];
  /** The per-person and per-discipline caps, as one sentence, or null. */
  capsLine?: string | null;
}) {
  const deadlineText = deadline === null ? null : formatDateTimeInZone(deadline, timeZone);
  const currencyKnown = Boolean((feeCurrency ?? '').trim());
  return (
    <section
      id="total"
      aria-label="Total and submit"
      // E5: slimmer on a phone, where this used to cost about a third of the
      // screen. `p-3` and a 2-up button row below `lg:`; in the 18rem side
      // rail from `lg:` up there is room, so it goes back to `p-4` and
      // stacked. Nothing is hidden at either width, the same four facts are
      // on the bar.
      //
      // 2026-08-11 design audit, finding #3: `position: sticky; bottom: 0`
      // engages the moment its containing block (this `<form>`) exceeds the
      // viewport height, which one default player block already does at
      // 390px, so the bar was pinned from initial paint, not just on final
      // scroll, covering ~21% of the viewport for the whole journey and
      // clipping the "Club (optional)" field before typing. Native CSS
      // cannot defer *when* a bottom-sticky element engages without content
      // to fill that gap, so this takes the finding's other option: read as
      // a DELIBERATE bottom sheet rather than an accidental one, tighter
      // `p-2.5`/`gap-1.5`, and `shadow-frame` (the design system's own
      // overlay-elevation token) instead of the card-weight `shadow-lg`.
      // `lg:shadow-sm` is untouched: the side rail sits beside content, not
      // over it, so it was never the overlay this addresses.
      className="sticky bottom-0 grid gap-1.5 rounded-t-lg border border-rule-soft bg-surface-raised p-2.5 shadow-frame lg:bottom-auto lg:top-6 lg:gap-3 lg:rounded-lg lg:p-4 lg:shadow-sm"
    >
      {state.kind === 'quoted' ? (
        // D1: two fields, not one string joined by a middle dot.
        <div data-quote-figure className="flex items-baseline justify-between gap-4 lg:block">
          <div>
            <p className="text-sm text-muted-foreground">{currencyKnown ? 'Quoted total' : 'Quoted amount'}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {`${state.eventCount} ${state.eventCount === 1 ? 'event' : 'events'}`}
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {formatMoney(state.totalCents, feeCurrency)}
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
      {/* Filled by `entry-wizard.js` when the selection changes after a
          quote; empty and hidden in the server document. */}
      <p data-quote-status hidden role="status" className="text-xs text-status-attention" />
      {state.kind === 'quoted' && !currencyKnown ? (
        <p className="text-xs text-muted-foreground">
          The organizer has not stated a currency. Confirm the amount with them before paying.
        </p>
      ) : null}
      {/* Refinement 3: the nearest deadline, restated where the decision is
          made. `chipLabel` carries the countdown; the moment names the day. */}
      <p className="text-xs text-muted-foreground">{chipLabel(chip)}</p>
      {chip.kind === 'entriesOpen' && deadlineText !== null ? (
        // D1: the closing moment is its own line, not a middle-dot suffix on
        // the chip's sentence.
        <p className="text-xs text-muted-foreground">{deadlineText}</p>
      ) : null}
      {/* Side by side on a phone, two stacked full-width buttons were the
          single biggest slice of the bar's height. Stacked again in the side
          rail, where 18rem is too narrow to share. */}
      {/* P6/D6: the two controls are tagged so the entry stage machine can
          show exactly ONE of them per stage, "Update total" while the
          entrant is still choosing events, "Submit entry" on review. With no
          script both stay, and the page is one form the reader can price and
          then post. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <span data-entry-bar-quote className="grid">
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
        </span>
        <span data-entry-bar-submit className="grid">
          <Button type="submit" variant="brand">
            Submit entry
          </Button>
        </span>
      </div>
      {feeTiers.length === 0 ? null : (
        // A09: ONE itemization, folded away, instead of the same multi-amount
        // sentence printed twice on one screen. Beside the number it explains.
        <details data-entry-fee-schedule className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            How the total is calculated
          </summary>
          <dl className="mt-1.5 grid gap-1">
            {feeTiers.map(([count, cents]) => (
              <div key={count} className="flex items-baseline justify-between gap-4 border-t border-rule-soft pt-1 text-xs">
                <dt className="text-muted-foreground">
                  {count} {count === '1' ? 'event' : 'events'} per player
                </dt>
                <dd className="font-medium tabular-nums text-foreground">{formatMoney(cents, feeCurrency)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-xs text-muted-foreground">
            The organizer sets and confirms every amount; nothing on this page prices an entry.
          </p>
        </details>
      )}
      {capsLine ? <p className="text-xs text-muted-foreground">{capsLine}</p> : null}
      <p className="text-xs leading-tight text-muted-foreground">
        The total is the organizer&rsquo;s quote and is confirmed on your receipt.
      </p>
    </section>
  );
}
