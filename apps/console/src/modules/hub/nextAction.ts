import type { TournamentSummaryDTO } from '../../api/dto';
import { attentionReasons } from './hubSignals';
import type { HubGroupId } from './hubGrouping';
// One table, two consumers: the Hub row CTA and the Overview checklist's
// per-step action must never name the same action two ways (SP-UI-1).
import { REASON_ACTION } from '../../platform/domain/setupChecklist';

const REASON_DESTINATION: Record<string, string> = {
  NO_MODULES_ENABLED: 'administration/modules',
  NO_ROSTER: 'participants/people',
  NO_BRACKET: 'bracket/draws',
  NOT_SCHEDULED: 'operations/plan',
  NO_DATE: 'setup/details',
  NO_VENUE: 'setup/details',
  ENTRIES_CLOSING_SOON: 'participants/entries',
  UNRESOLVED_PAIRS: 'participants/entries',
  AT_CAP_WITH_WAITLIST: 'participants/entries',
  ENTRIES_NOT_COMMITTED: 'participants/entries',
  COMMITTED_ENTRY_WITHDREW: 'participants/entries',
  UNPAID_ENTRIES: 'participants/entries',
};

/** Attention codes the desk can only resolve at the entries desk (V3-OC02.2).
 *  A workspace can be fully played out (phase `complete`) and still have an
 *  entries loose end — "View draws"/"View results" does not route there, so
 *  the row's next action must name the entries problem instead of the
 *  play-side review surface once one of these is the leading reason. */
const ENTRIES_ATTENTION_CODES = new Set(Object.keys(REASON_DESTINATION).filter((code) =>
  REASON_DESTINATION[code] === 'participants/entries',
));

/** Entries is cloud-only. When the catalog is present, never send an operator
 * to an entries surface unless that module is actually enabled. Older summary
 * payloads omit the catalog, so retain their historical behaviour. */
function entriesModuleEnabled(t: TournamentSummaryDTO): boolean {
  return t.modules ? t.modules.some((module) => module.moduleId === 'entries' && module.status === 'enabled') : true;
}

/** "Review entries" when the leading attention reason concerns entries —
 *  V3-OC02.2: the row used to offer "View draws" for a completed bracket
 *  with an unresolved entries reason ("Confirmed entries not on the
 *  roster"), which does not open anything that helps. Null when the leading
 *  reason (if any) is not entries-shaped, so callers fall through to their
 *  ordinary phase/group action. */
function entriesReviewAction(t: TournamentSummaryDTO): RowAction | null {
  if (!entriesModuleEnabled(t)) return null;
  const first = attentionReasons(t)[0];
  if (first && ENTRIES_ATTENTION_CODES.has(first.code)) {
    return { label: 'Review entries', kind: 'open', segment: 'participants/entries' };
  }
  return null;
}

/** The primary next action for a workspace — the first mapped attention reason,
 *  else "Open". Pure; degrades to Open when signals are absent. */
export function nextActionFor(t: TournamentSummaryDTO): { label: string; reasonCode: string | null } {
  const first = attentionReasons(t).find((reason) =>
    entriesModuleEnabled(t) || !ENTRIES_ATTENTION_CODES.has(reason.code),
  );
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
  // A stale entries review signal must not mask real play state when the
  // optional entries module is disabled. The match counters are the same
  // source used by the live-day surface, so they provide a safe fallback.
  const phase = !entriesModuleEnabled(t) && t.signals?.phase === 'entries_review'
    ? (t.signals.matches?.playing && t.signals.matches.playing > 0
      ? 'live'
      : t.signals.matches?.played && t.signals.matches.total > 0 && t.signals.matches.played >= t.signals.matches.total
        ? 'complete'
        : 'ready')
    : t.signals?.phase;
  const br = t.kind === 'bracket';
  if (t.status !== 'archived') {
    if (phase === 'live')
      return { label: 'Open live day', kind: 'open', segment: 'operations/live' };
    if (phase === 'complete')
      return (
        entriesReviewAction(t) ??
        (br
          ? { label: 'View draws', kind: 'results', segment: 'bracket/draws' }
          : { label: 'View results', kind: 'results', segment: 'meet/matches' })
      );
  }
  if (group === 'undated') return { label: 'Set date', kind: 'set-date' };
  if (group === 'past')
    return (
      entriesReviewAction(t) ??
      (br
        ? { label: 'View draws', kind: 'results', segment: 'bracket/draws' }
        : { label: 'View results', kind: 'results', segment: 'meet/matches' })
    );
  const next = nextActionFor(t);
  return {
    label: next.reasonCode ? next.label : 'Open workspace',
    kind: 'open',
    segment: next.reasonCode ? REASON_DESTINATION[next.reasonCode] : undefined,
  };
}
