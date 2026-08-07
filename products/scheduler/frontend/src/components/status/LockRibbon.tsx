/**
 * LockRibbon — the one lock banner every config surface renders.
 *
 * TIERS ARE NAMED FOR WHAT IS TRUE, NOT FOR HOW LOUD THEY ARE.
 *
 * They used to be `soft` / `hard`, which named the volume and left the
 * condition implicit. That hid a real divergence: Bracket implemented both
 * tiers while Meet only ever rendered the quiet one, so the SAME real-world
 * situation — results recorded — produced an amber "saving will clear this"
 * on Meet and a neutral read-only banner on Bracket. Naming the tiers after
 * the condition makes a missing tier visible instead of invisible.
 *
 * Two orthogonal axes decide the tier, per the disabled-vs-read-only and
 * notification-severity patterns both Cloudscape and Carbon converge on:
 *
 *   1. CAN THE OPERATOR STILL EDIT?
 *      Read-only means the values stay visible and legible but inert — it is
 *      not the same as "disabled", which means a prerequisite is missing and
 *      the control will come back once you do something.
 *   2. IS THIS A PENDING CONSEQUENCE, OR A STATEMENT OF CONDITION?
 *      Warning severity is for something the operator is ABOUT to cause.
 *      A standing condition with nothing pending is neutral. Colouring both
 *      amber is what trains an operator to stop reading amber.
 *
 *   - `schedule` — a committed schedule exists and saving will discard it.
 *     Editable, warning amber. The consequence is pending and reversible-by-
 *     choice, so the Save flow's confirm modal is the action; none is
 *     rendered here.
 *   - `results` — scores are recorded. Editing scoring or timing now would
 *     corrupt them, so the surface is READ-ONLY, and it is calm neutral
 *     because this is the normal healthy mid-event state, not an alarm.
 *     Pass `action` to name the exit path — a read-only surface must say
 *     where the state is resolved, or it reads as a dead end.
 *
 * Copy is engine-neutral so the two Configuration surfaces read identically;
 * only the `action` link differs (View draws / View matches).
 *
 * `locked` drives this off a PER-ENGINE signal rather than the meet store
 * flag — the two engines schedule independently, so locking the meet
 * schedule must never light up the bracket. Omitted, it falls back to the
 * meet store flag.
 */
import type { ReactNode } from 'react';
import { useTournamentStore } from '../../store/tournamentStore';

const TIERS = {
  schedule: {
    chrome:
      'bg-status-warning-bg border-status-warning-fg/30 text-status-warning-fg',
    label: 'Schedule committed',
    reason: 'Saving these settings will clear it.',
  },
  results: {
    chrome: 'bg-muted/40 border-border text-muted-foreground',
    label: 'Results recorded',
    reason: 'Settings are read-only while matches are in play.',
  },
} as const;

export type LockTier = keyof typeof TIERS;

/* Two shapes, because this renders in two different slots.
 *
 * `ribbon` (default) is the PAGE-LEVEL banner slot — the `ribbons=` prop on
 * the setup shells, whose other occupants (new-tournament, error, saveError)
 * are all full-bleed `border-b` bands. This component used to render a
 * rounded, fully-bordered CHIP in that slot, so it was the one banner that
 * did not follow the pattern: rounded corners floating in a square well with
 * a gap around them. Square, bottom rule, same padding as its siblings.
 *
 * `inline` is for in-flow use inside padded page content, where a full-bleed
 * band would be wrong — there it keeps a full border and the system radius. */
const SHAPES = {
  ribbon: 'shrink-0 border-b px-4 py-2',
  inline: 'rounded-sm border px-3 py-1.5',
} as const;

interface LockRibbonProps {
  tier: LockTier;
  className?: string;
  /** Explicit per-engine lock state. Omit to read the meet store flag. */
  locked?: boolean;
  /** Where the state is resolved. Required in spirit for `results`: an inert
   *  surface with no named exit is a dead end. */
  action?: ReactNode;
  /** `ribbon` (default) for the page banner slot; `inline` for page content. */
  variant?: keyof typeof SHAPES;
}

export function LockRibbon({
  tier,
  className = '',
  locked,
  action,
  variant = 'ribbon',
}: LockRibbonProps) {
  const meetLocked = useTournamentStore((state) => state.isScheduleLocked);
  const isLocked = locked ?? meetLocked;

  if (!isLocked) return null;
  const t = TIERS[tier];

  return (
    <div
      data-testid="lock-ribbon"
      data-tier={tier}
      data-variant={variant}
      className={`flex items-center gap-1.5 text-xs ${SHAPES[variant]} ${t.chrome} ${className}`}
    >
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
      </svg>
      <span className="font-medium">{t.label}.</span>
      <span>{t.reason}</span>
      {action}
    </div>
  );
}
