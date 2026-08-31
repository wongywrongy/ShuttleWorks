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
import { STATUS_TONE } from '@scheduler/design-system/components';
import { chipLabel, type ChipState } from '../lib/phase';

/** The shared tone palette (ADR 0020), composed in this register's
 *  historical order so the rendered string stays byte-identical. */
const chipTone = (tone: 'live' | 'done') => {
  const t = STATUS_TONE[tone];
  return `${t.border} ${t.bg} ${t.text}`;
};

export function StatusChip({ state }: { state: ChipState }) {
  const open = state.kind === 'entriesOpen';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
        open ? chipTone('live') : chipTone('done')
      }`}
    >
      {open ? (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE.live.dot}`} />
      ) : null}
      {chipLabel(state)}
    </span>
  );
}
