/**
 * The Hub's Status column vocabulary (D2).
 *
 * The list used to state status only when a lifecycle CHIP happened to apply
 * (Archived/Complete) and to suppress it whenever every visible row would say
 * the same thing — so the commonest reading of the column was blank, and blank
 * had to be decoded as "some state we did not name". A status column that is
 * empty most of the time is not a status column.
 *
 * Every workspace therefore resolves to exactly one label, and the derivation
 * keeps the two axes apart: TIME (where the event sits relative to today) never
 * overrides LIFECYCLE (what the operator has declared). An old draft that was
 * never run stays **Draft** — it must not silently become Completed just
 * because its date has passed.
 *
 * Precedence, highest first:
 *   1. archived            → Archived   (shared precedence, platform/domain/lifecycle)
 *   2. derived phase live  → Live       (real play beats the calendar)
 *   3. derived phase complete → Completed
 *   4. status draft        → Draft      (never yet run, whatever its date says)
 *   5. today inside range  → Live
 *   6. range already ended → Completed
 *   7. otherwise           → Upcoming   (including a dated-but-future or
 *                                        undated active workspace)
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { timeBucketOf } from './hubFacets';

export type WorkspaceStatusLabel =
  | 'Draft'
  | 'Upcoming'
  | 'Live'
  | 'Completed'
  | 'Archived';

export function workspaceStatusLabel(
  t: TournamentSummaryDTO,
  now: Date = new Date(),
): WorkspaceStatusLabel {
  if (t.status === 'archived') return 'Archived';
  const phase = t.signals?.phase;
  if (phase === 'live') return 'Live';
  if (phase === 'complete') return 'Completed';
  if (t.status === 'draft') return 'Draft';
  const bucket = timeBucketOf(t, now);
  if (bucket === 'live') return 'Live';
  if (bucket === 'past') return 'Completed';
  return 'Upcoming';
}

/** Status is readable TEXT; colour only supplements it (D1). Live is the one
 *  state that earns ink of its own — everything else is ordinary. */
export function workspaceStatusClass(label: WorkspaceStatusLabel): string {
  return label === 'Live' ? 'text-status-live' : 'text-text-secondary';
}
