/**
 * planDialogs — the Plan surface's dialog-routing state (SP-CONSOLE-4 B1).
 *
 * One discriminated union for every schedule-mutation dialog the Plan
 * surface hosts, plus the advisory → dialog dispatcher the legacy pages
 * carried in duplicate (`handleAdvisoryReview` in SchedulePage and
 * MatchControlCenterPage). The union lives at the OperationsProduct level
 * because THREE things open dialogs: the toolbar's buttons, the advisory
 * banner's Review, and the detail rail's "Move…" — and they must all reach
 * the same single mount.
 */
import type { Advisory } from '../../../api/dto';
import type { DisruptionType } from '../../../api/client';

export type PlanDialog =
  | {
      kind: 'disruption';
      prefill?: { type?: DisruptionType; matchId?: string; courtId?: number };
    }
  | { kind: 'director' }
  | { kind: 'warm-restart' }
  | { kind: 'move'; matchId: string };

/** The advisory Review dispatcher: which dialog answers an advisory's
 *  suggested action. Mirrors the legacy mapping exactly — repair advisories
 *  open the problem-report (repair) dialog; warm-restart opens the
 *  stay-close re-plan; the schedule-shape actions open Director tools. */
export function dialogForAdvisory(advisory: Advisory): PlanDialog | null {
  const action = advisory.suggestedAction;
  if (!action) return null;
  switch (action.kind) {
    case 'repair':
      return {
        kind: 'disruption',
        prefill: { matchId: advisory.matchId ?? undefined },
      };
    case 'warm_restart':
      return { kind: 'warm-restart' };
    case 'delay_start':
    case 'insert_blackout':
    case 'remove_blackout':
    case 'compress_remaining':
      return { kind: 'director' };
    default:
      return null;
  }
}
