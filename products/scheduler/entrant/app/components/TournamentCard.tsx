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
        <div className="min-w-0 flex-1">
          {/* Refinement 2 via a FLOAT, not a flex column: the chip pins to
              the card's top-right corner — one vertical line of chips down
              the results list — while a long tournament name keeps the full
              card width, wrapping under the chip instead of into a pinched
              column beside it. Announced before the name; the chip is the
              card's one-glance answer, so leading with it reads correctly. */}
          <span className="float-right mb-1 ml-3">
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
