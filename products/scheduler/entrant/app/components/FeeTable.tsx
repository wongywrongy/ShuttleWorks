/**
 * The Fees card body: the director's cumulative bundle tiers ("1 event —
 * 14.00", per-player framing), or per-event prices when no schedule is set.
 * When neither exists it renders null and the Overview grid simply lacks the
 * card (rule 4 — no empty placeholder).
 *
 * Display only: every number is server cents through `formatCents`; the
 * total an entrant actually pays is `compute_fee_total`'s, quoted on the
 * enter page (R14 / Seam B).
 */
import type { EntryEventDTO } from '../lib/entryPage.types';
import { formatCents } from '../lib/money';

export function FeeTable({
  feeSchedule,
  events,
}: {
  feeSchedule: Record<string, number>;
  events: EntryEventDTO[];
}) {
  const tiers = Object.entries(feeSchedule).sort(([a], [b]) => Number(a) - Number(b));
  const perEvent = events.filter(
    (event): event is EntryEventDTO & { feeCents: number } => event.feeCents !== null,
  );
  if (tiers.length === 0 && perEvent.length === 0) return null;

  return (
    <>
      <table className="w-full text-sm">
        <tbody>
          {tiers.length > 0
            ? tiers.map(([count, cents]) => (
                <tr key={count} className="border-b border-rule-soft last:border-b-0">
                  <td className="py-1.5 text-foreground">
                    {count} {count === '1' ? 'event' : 'events'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">
                    {formatCents(cents)}
                  </td>
                </tr>
              ))
            : perEvent.map((event) => (
                <tr key={event.id} className="border-b border-rule-soft last:border-b-0">
                  <td className="py-1.5 text-foreground">
                    {event.discipline}{' '}
                    <span className="text-muted-foreground">({event.code})</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">
                    {formatCents(event.feeCents)}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Per player. Your exact total is quoted on the entry form before you submit.
      </p>
    </>
  );
}
