/**
 * Single source of truth for "what assignments should we render?".
 *
 * A schedule with a candidate pool stores N near-optimal alternatives
 * in ``schedule.candidates`` and an ``activeCandidateIndex`` pointing
 * at the one currently chosen by the operator. Older schedules (and
 * any path that doesn't run the candidate collector) only have the
 * top-level ``assignments`` array. This helper hides the difference:
 * always read assignments through it, never reach into
 * ``schedule.assignments`` directly.
 *
 * Returns an empty array when the schedule is null so callers can use
 * the result with ``.map`` / ``.filter`` without a guard.
 */
import type { ScheduleAssignment, ScheduleDTO } from '../api/dto';

export function getActiveAssignments(schedule: ScheduleDTO | null | undefined): ScheduleAssignment[] {
  if (!schedule) return [];
  const idx = schedule.activeCandidateIndex ?? 0;
  return schedule.candidates?.[idx]?.assignments ?? schedule.assignments;
}
