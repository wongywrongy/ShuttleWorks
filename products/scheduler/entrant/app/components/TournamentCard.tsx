/**
 * One discovery result. Fixed anatomy (brief §1): date badge · name · venue
 * locality · events count · status chip. The name is the card's single link,
 * stretched over the whole card so one tournament is one tap target and one
 * tab stop.
 *
 * Refinement 2 (Phase B sign-off): from `sm:` up the chip sits in a fixed,
 * right-aligned column rather than a bottom row — scanning a list of cards,
 * the eye finds every "can I enter this" answer in one vertical line. On
 * phones it stays the bottom row, where the narrow column leaves it room.
 */
import { cardChipState, type DiscoveryCard } from '../lib/phase';
import { DateBadge } from './DateBadge';
import { StatusChip } from './StatusChip';

export function TournamentCard({ card, now }: { card: DiscoveryCard; now: Date }) {
  const chip = cardChipState(card, now);
  return (
    <li className="relative rounded-lg border border-rule-soft bg-surface-raised p-4 shadow-sm transition-shadow duration-fast hover:border-rule-control hover:shadow-md">
      <div className="flex items-start gap-3.5">
        <DateBadge date={card.tournamentDate} />
        {/* Two layouts, one markup. Below `sm:` this is a flex column, so
            `order-last` on the chip lays it out as the bottom row while it
            stays FIRST in the DOM (which the float requires) — no second
            copy of the chip for a screen reader to read twice. From `sm:` up
            it is `display: block` again, `order` goes inert, and the float
            below takes over. */}
        <div className="flex min-w-0 flex-1 flex-col sm:block">
          {/* Refinement 2 via a FLOAT, not a flex column: from `sm:` up the
              chip pins to the card's top-right corner — one vertical line of
              chips down the results list — while a long tournament name keeps
              the full card width, wrapping under the chip instead of into a
              pinched column beside it.

              **Scoped to `sm:`, which it was not.** Unconditional, the float
              made a long name wrap AROUND the chip at 390px ("2026 Bay" /
              "Badminton Late Summer Open") — where the column is too narrow
              for a name and a chip to share a line, and where this
              component's docstring always said the chip is the bottom row. */}
          <span className="order-last mt-2 sm:float-right sm:mb-1 sm:ml-3 sm:mt-0">
            <StatusChip state={chip} />
          </span>
          {/* The single link: stretched via the ::after overlay, so the
              whole card is one target without nested interactive noise. */}
          <a
            href={`/e/${encodeURIComponent(card.slug)}`}
            className="font-medium text-foreground after:absolute after:inset-0 after:rounded-lg"
          >
            {card.name}
          </a>
          {card.venueName ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{card.venueName}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {`${card.eventCount} ${card.eventCount === 1 ? 'event' : 'events'}`}
          </p>
        </div>
      </div>
    </li>
  );
}
