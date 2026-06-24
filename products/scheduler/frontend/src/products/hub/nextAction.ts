import type { TournamentSummaryDTO } from '../../api/dto';
import { attentionReasons } from './hubSignals';

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
