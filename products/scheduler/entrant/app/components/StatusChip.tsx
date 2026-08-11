/**
 * The two-state status chip (owner ruling on STOP-4): `Entries open
 * [— closes in Nd]` on the live ramp, `Entries closed` on the done ramp —
 * and NOTHING else: no Live, no Finished, no In-play until a real public
 * lifecycle signal exists. Sentence case and a full pill — the consumer
 * register of `StatusPill`'s token mapping, not the operator's uppercase
 * micro-label. The dot is decoration and hidden from AT; the text carries
 * the whole meaning. The component has no judgement of its own: the state
 * arrives decided (`chipState`/`cardChipState`, `lib/phase.ts`).
 */
import { chipLabel, type ChipState } from '../lib/phase';

export function StatusChip({ state }: { state: ChipState }) {
  const open = state.kind === 'entriesOpen';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
        open
          ? 'border-status-live/40 bg-status-live-bg text-status-live'
          : 'border-status-done/40 bg-status-done-bg text-status-done'
      }`}
    >
      {open ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-status-live" />
      ) : null}
      {chipLabel(state)}
    </span>
  );
}
