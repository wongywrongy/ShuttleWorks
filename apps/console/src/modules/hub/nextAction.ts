import type { TournamentSummaryDTO } from '../../api/dto';
import { attentionReasons } from './hubSignals';
import type { HubGroupId } from './hubGrouping';
// One table, two consumers: the Hub row CTA and the Overview checklist's
// per-step action must never name the same action two ways (SP-UI-1).
import { REASON_ACTION } from '../../platform/domain/setupChecklist';

const REASON_DESTINATION: Record<string, string> = {
  NO_MODULES_ENABLED: 'administration/modules',
  NO_ROSTER: 'participants/people',
  NO_BRACKET: 'competition/draws',
  NOT_SCHEDULED: 'operations/plan',
  NO_DATE: 'setup/dates',
  NO_VENUE: 'setup/venue',
};

/** The primary next action for a workspace — the first mapped attention reason,
 *  else "Open". Pure; degrades to Open when signals are absent. */
export function nextActionFor(t: TournamentSummaryDTO): { label: string; reasonCode: string | null } {
  const first = attentionReasons(t)[0];
  if (first && REASON_ACTION[first.code]) {
    return { label: REASON_ACTION[first.code], reasonCode: first.code };
  }
  return { label: 'Open', reasonCode: null };
}

/** What the single row CTA does, in plain language, by time group:
 *  - undated → "Set date" (opens General settings — there is no date route).
 *  - past    → the most useful review surface for that workspace kind.
 *  - upcoming → the most useful setup step, else "Open workspace". */
type RowActionKind = 'open' | 'set-date' | 'results';
export interface RowAction {
  label: string;
  kind: RowActionKind;
  /** In-workspace segment the CTA lands on — a button that navigates names
   *  its DESTINATION (G1), so "Open live day" must open the live day, not
   *  the Overview. Absent → the Overview default. */
  segment?: string;
}

export function rowActionFor(t: TournamentSummaryDTO, group: HubGroupId): RowAction {
  // The derived lifecycle phase beats the date heuristics: a tournament that
  // is mid-play or fully resolved must never be told to "Set date" — the
  // useful action is watching/reviewing it, dated or not. ARCHIVED outranks
  // the phase (shared precedence — platform/domain/lifecycle.ts): match rows
  // persist, so an archived tournament keeps phase 'live'/'complete' forever
  // and must not be offered "Open live day".
  const phase = t.signals?.phase;
  const br = t.kind === 'bracket';
  if (t.status !== 'archived') {
    if (phase === 'live')
      return { label: 'Open live day', kind: 'open', segment: 'operations/live' };
    if (phase === 'complete')
      return br
        ? { label: 'View draws', kind: 'results', segment: 'competition/draws' }
        : { label: 'View results', kind: 'results', segment: 'competition/results' };
  }
  if (group === 'undated') return { label: 'Set date', kind: 'set-date' };
  if (group === 'past')
    return br
      ? { label: 'View draws', kind: 'results', segment: 'competition/draws' }
      : { label: 'View results', kind: 'results', segment: 'competition/results' };
  const next = nextActionFor(t);
  return {
    label: next.reasonCode ? next.label : 'Open workspace',
    kind: 'open',
    segment: next.reasonCode ? REASON_DESTINATION[next.reasonCode] : undefined,
  };
}
