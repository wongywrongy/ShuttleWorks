/**
 * The two-state status chip (owner ruling on STOP-4): `Entries open
 * [— closes in Nd]` on the live ramp, `Entries closed` on the done ramp —
 * and NOTHING else: no Live, no Finished, no In-play until a real public
 * lifecycle signal exists. Sentence case on a rectangular 4px chip — the
 * consumer register of `StatusPill`'s token mapping, not the operator's
 * uppercase micro-label. Colour + text only: no dot, nothing fully round
 * (ADR 0027). The component has no judgement of its own: the state
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
      className={`inline-flex h-badge shrink-0 items-center whitespace-nowrap rounded-xs border px-2.5 text-xs font-medium leading-none ${
        open ? chipTone('live') : chipTone('done')
      }`}
    >
      {chipLabel(state)}
    </span>
  );
}
