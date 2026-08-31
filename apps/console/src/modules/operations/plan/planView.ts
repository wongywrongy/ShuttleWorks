/**
 * Plan's spatial view policy.
 *
 * The court × time board is only an honest representation when the schedule
 * promises courts (pinned policy) and at least one authoritative assignment
 * exists. Queue solves promise an ordered call list, not a court placement;
 * missing assignments stay in the list rather than being guessed into a
 * cell. This is deliberately pure so the Operations surface can make the
 * same decision for Meet, Bracket, complete, and in-progress workspaces.
 */
import type { ScheduleDTO, TournamentConfig } from '../../../api/dto';
import type { OpsBlock } from '../opsBlock';

export type PlanSpatialMode = 'grid' | 'call-list' | 'list';

export interface PlanViewDecision {
  mode: PlanSpatialMode;
  /** Number of blocks with both authoritative court and time placement. */
  assignedCount: number;
  /** Blocks that remain in the shared list because placement is unknown. */
  unassignedCount: number;
  /** The policy the current data actually represents, not merely the config. */
  effectivePolicy: 'pinned' | 'queue';
}

export function hasAuthoritativeAssignment(block: Pick<OpsBlock, 'court' | 'slot'>): boolean {
  return block.court != null && block.slot != null;
}

export function effectivePlanPolicy(
  config: Pick<TournamentConfig, 'courtPolicy'> | null,
  schedule: Pick<ScheduleDTO, 'effectivePolicy'> | null,
): 'pinned' | 'queue' {
  // Bracket assignments are inherently court-tied. Meet's legacy/omitted
  // policy is pinned by default. A queue configuration remains queue until
  // the schedule explicitly reports the pinned fallback caused by closures.
  // `effectivePolicy` is the solver's statement of what the returned
  // assignments mean. Prefer it whenever present; the config is only the
  // fallback for legacy schedules that predate this field.
  if (schedule?.effectivePolicy) return schedule.effectivePolicy;
  return config?.courtPolicy === 'queue' ? 'queue' : 'pinned';
}

export function resolvePlanView(
  blocks: readonly Pick<OpsBlock, 'court' | 'slot'>[],
  config: Pick<TournamentConfig, 'courtPolicy'> | null,
  schedule: Pick<ScheduleDTO, 'effectivePolicy'> | null,
): PlanViewDecision {
  const assignedCount = blocks.filter(hasAuthoritativeAssignment).length;
  const unassignedCount = blocks.length - assignedCount;
  const effectivePolicy = effectivePlanPolicy(config, schedule);

  if (effectivePolicy === 'queue') {
    return { mode: 'call-list', assignedCount, unassignedCount, effectivePolicy };
  }
  if (assignedCount === 0) {
    return { mode: 'list', assignedCount, unassignedCount, effectivePolicy };
  }
  return { mode: 'grid', assignedCount, unassignedCount, effectivePolicy };
}
