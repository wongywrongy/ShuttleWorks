/**
 * ONE setup model, joining `signals.setup` with `signals.attention` (SP-UI-1).
 *
 * The Overview and the Hub inspector each used to render the readiness
 * checklist and the "needs attention" list as two separate objects — but they
 * are one fact set stated twice: "roster: false" and "NO_ROSTER — No players
 * added yet" are the same thing, split across two lists, neither actionable.
 *
 * Joining them removes a whole object from the page and makes the survivor
 * actionable: the attention copy becomes the incomplete step's subline, and
 * the step carries the route that fixes it.
 *
 * The step list is DATA, not hand-authored JSX per step, because future
 * lifecycle phases add steps by extending these tables.
 */
import type { AppTab } from '../../store/uiStore';
import type { TournamentSummaryDTO } from '../../api/dto';

export interface ChecklistAction {
  label: string;
  segment: AppTab;
}

export interface ChecklistStep {
  /** The raw `signals.setup` key — also the React key. */
  key: string;
  label: string;
  done: boolean;
  /** The former "needs attention" copy; null when the step is done or has no
   *  coded reason. Rendered as the step's subline. */
  reason: string | null;
  /** Where to go to fix it. Null when done, blocked, or unroutable. */
  action: ChecklistAction | null;
  /** True when an earlier step is incomplete. Rendered present-but-quiet with
   *  no action button, so the sequence stays legible without inviting a click
   *  that lands on a surface the operator cannot use yet. */
  blocked: boolean;
}

/** Canonical step order per workspace kind. Pinned explicitly rather than
 *  trusting `Object.entries` insertion order to survive a backend edit. */
const STEP_ORDER: Record<'meet' | 'bracket', readonly string[]> = {
  meet: ['configured', 'roster', 'scheduled', 'results'],
  bracket: ['events', 'bracketBuilt', 'results'],
};

/** Step key → the attention code that explains why it is incomplete. Steps
 *  with no coded reason (e.g. `results`) simply render without a subline. */
const STEP_REASON_CODE: Record<string, string> = {
  roster: 'NO_ROSTER',
  scheduled: 'NOT_SCHEDULED',
  bracketBuilt: 'NO_BRACKET',
};

/** Attention code → the operator's most useful next action. Shared with the
 *  Hub's row CTA (`modules/hub/nextAction.ts` imports this) so the control
 *  plane names an action exactly one way. */
export const REASON_ACTION: Record<string, string> = {
  NO_ROSTER: 'Add players',
  NOT_SCHEDULED: 'Generate schedule',
  NO_BRACKET: 'Build the bracket',
  NO_MODULES_ENABLED: 'Enable a module',
  DISPLAY_NO_SOURCE: 'Enable an operator',
};

/** Human label for a `signals.setup` key. The backend emits camelCase
 *  (`bracketBuilt`); split it into words so `capitalize` renders
 *  "Bracket built" rather than "BracketBuilt". */
export function setupLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').trim();
}

/** Fallback action label when a step is incomplete but carries no coded
 *  attention reason — the destination still exists, so offer it as a verb. */
const STEP_FALLBACK_ACTION: Record<string, string> = {
  configured: 'Configure',
  events: 'Add events',
  results: 'Record results',
};

/**
 * The section a step links to, by key + workspace kind. Substring-matched so a
 * backend that renames `scheduled` → `schedulePublished` keeps routing.
 * Returns null for steps with no obvious destination.
 */
export function stepTarget(key: string, kind: 'meet' | 'bracket'): AppTab | null {
  const k = key.toLowerCase();
  const br = kind === 'bracket';
  if (k.includes('config')) return br ? 'bracket-setup' : 'setup';
  if (k.includes('roster') || k.includes('player') || k.includes('participant'))
    return br ? 'bracket-roster' : 'roster';
  if (k.includes('event')) return 'bracket-draws';
  if (k.includes('draw') || k.includes('bracket')) return 'bracket-draws';
  if (k.includes('schedul')) return br ? 'bracket-schedule' : 'schedule';
  if (k.includes('result') || k.includes('score') || k.includes('live'))
    return br ? 'bracket-live' : 'live';
  return null;
}

/**
 * Build the merged step list. Pure; safe on payloads with no `signals` (older
 * responses) — returns an empty list, and callers render nothing.
 *
 * `blocked` is computed by walking in canonical order: the first incomplete
 * step is the actionable one, everything incomplete after it is blocked.
 */
export function buildChecklist(summary: TournamentSummaryDTO | null): ChecklistStep[] {
  const setup = summary?.signals?.setup;
  if (!summary || !setup) return [];

  const kind: 'meet' | 'bracket' = summary.kind === 'bracket' ? 'bracket' : 'meet';
  // Canonical order first, then any key the backend added that we don't know
  // about yet — an unknown step must still render, never vanish.
  const known = STEP_ORDER[kind].filter((k) => k in setup);
  const extra = Object.keys(setup).filter((k) => !known.includes(k));
  const keys = [...known, ...extra];

  const reasons = summary.signals?.attention ?? [];
  const reasonByCode = new Map(reasons.map((r) => [r.code, r.label]));

  let seenIncomplete = false;
  return keys.map((key) => {
    const done = Boolean(setup[key]);
    const blocked = !done && seenIncomplete;
    if (!done) seenIncomplete = true;

    const code = STEP_REASON_CODE[key];
    const reason = !done && code ? (reasonByCode.get(code) ?? null) : null;

    let action: ChecklistAction | null = null;
    if (!done && !blocked) {
      const segment = stepTarget(key, kind);
      if (segment) {
        const label =
          (code ? REASON_ACTION[code] : undefined) ??
          STEP_FALLBACK_ACTION[key] ??
          `Open ${setupLabel(key).toLowerCase()}`;
        action = { label, segment };
      }
    }

    return { key, label: setupLabel(key), done, reason, action, blocked };
  });
}

/** ready / total over the merged list; null when there are no steps. */
export function checklistProgress(
  steps: readonly ChecklistStep[],
): { ready: number; total: number } | null {
  if (steps.length === 0) return null;
  return { ready: steps.filter((s) => s.done).length, total: steps.length };
}
