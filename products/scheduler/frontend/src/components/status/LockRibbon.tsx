/**
 * LockRibbon — the one lock chip every config surface renders.
 *
 * Same anatomy everywhere (lock icon · state · reason · optional action);
 * only the tier varies, because the two lock kinds mean opposite things
 * to an operator:
 *   - `soft` — warning amber. A committed schedule exists and saving will
 *     clear it (the Save flow's confirm modal is the action, so none is
 *     rendered here). Genuine data-loss caution.
 *   - `hard` — calm neutral. A draw is in play, so results are protected
 *     and the settings are read-only. This is the normal, healthy
 *     mid-tournament state — it must NOT read as an alarm (amber-for-
 *     everything trains operators to ignore amber). Pass `action` to name
 *     the exit path (e.g. a "View draws" link, where finish/reset lives).
 *
 * Replaces ScheduleLockIndicator: a lock must never render bare — every
 * tier states its reason, per the disabled-states guidance this rework
 * followed (NN/g, Carbon/Cloudscape read-only patterns).
 *
 * `locked` lets a caller drive this off a PER-ENGINE lock signal rather
 * than the meet store flag — the two engines schedule independently, so
 * locking the meet schedule must never light up on the bracket. When
 * `locked` is omitted it falls back to the meet store flag.
 */
import type { ReactNode } from 'react';
import { useTournamentStore } from '../../store/tournamentStore';

const TIERS = {
  soft: {
    chrome:
      'bg-status-warning-bg border-status-warning-fg/30 text-status-warning-fg',
    label: 'Schedule locked',
    reason: 'Saving will clear the committed schedule.',
  },
  hard: {
    chrome: 'bg-muted/40 border-border text-muted-foreground',
    label: 'Results in play',
    reason: 'Settings are read-only until the started draws are finished or reset.',
  },
} as const;

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
  tier: keyof typeof TIERS;
  className?: string;
  /** Explicit per-engine lock state. Omit to read the meet store flag. */
  locked?: boolean;
  /** The exit path for locks whose resolution lives elsewhere (hard tier:
   *  a link to the surface where the draws can be finished or reset). */
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
