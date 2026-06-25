import type { TournamentSummaryDTO } from '../../api/dto';
import { attentionReasons } from './hubSignals';
import type { HubGroupId } from './hubGrouping';

/** Attention reason code → the operator's most useful next action. */
const REASON_ACTION: Record<string, string> = {
  NO_ROSTER: 'Add players',
  NOT_SCHEDULED: 'Generate schedule',
  NO_BRACKET: 'Build the bracket',
  NO_MODULES_ENABLED: 'Enable a module',
  DISPLAY_NO_SOURCE: 'Enable an operator',
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
 *  - past    → "View results" (opens the workspace, receded — it's done).
 *  - upcoming → the most useful setup step, else "Open workspace". */
export type RowActionKind = 'open' | 'set-date' | 'results';
export interface RowAction {
  label: string;
  kind: RowActionKind;
}

export function rowActionFor(t: TournamentSummaryDTO, group: HubGroupId): RowAction {
  if (group === 'undated') return { label: 'Set date', kind: 'set-date' };
  if (group === 'past') return { label: 'View results', kind: 'results' };
  const next = nextActionFor(t);
  return { label: next.reasonCode ? next.label : 'Open workspace', kind: 'open' };
}
