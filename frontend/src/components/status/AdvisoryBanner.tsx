/**
 * Live-operations advisory banner.
 *
 * Renders the highest-severity active advisory at the top of pages
 * that opt in (Live tab and TV display). Mirrors the pattern of
 * ``ScheduleLockIndicator`` but with severity-driven coloring and an
 * optional CTA that dispatches the advisory's ``suggestedAction``.
 *
 * The banner is read-only on the public TV display (no CTA, just the
 * heads-up); operators see the CTA on the Live tab.
 */
import { Warning, WarningOctagon, Info } from '@phosphor-icons/react';
import { useAppStore } from '../../store/appStore';
import type { Advisory, AdvisorySeverity } from '../../api/dto';

interface AdvisoryBannerProps {
  /** When true, the banner only shows the message (no Review button).
   *  Used on the public TV display. */
  readOnly?: boolean;
  /** Override the action handler for the Review button. Defaults to
   *  setting the active advisory's matchId / suggestedAction in the
   *  store so the page-owner dialog can pick it up. */
  onReview?: (advisory: Advisory) => void;
  className?: string;
}

const TONE: Record<AdvisorySeverity, { ring: string; text: string; icon: string }> = {
  info: {
    ring: 'border-blue-200 bg-blue-50',
    text: 'text-blue-800',
    icon: 'text-blue-500',
  },
  warn: {
    ring: 'border-amber-300 bg-amber-50',
    text: 'text-amber-800',
    icon: 'text-amber-500',
  },
  critical: {
    ring: 'border-red-300 bg-red-50',
    text: 'text-red-800',
    icon: 'text-red-500',
  },
};

const RANK: Record<AdvisorySeverity, number> = { critical: 0, warn: 1, info: 2 };

function pickHighestSeverity(advisories: Advisory[], readOnly: boolean): Advisory | null {
  // The TV banner only surfaces critical advisories — info/warn would
  // be noise to spectators. The Live banner surfaces warn + critical.
  const eligible = advisories.filter((a) =>
    readOnly ? a.severity === 'critical' : a.severity !== 'info',
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, candidate) =>
    RANK[candidate.severity] < RANK[best.severity] ? candidate : best,
  );
}

function Icon({ severity, className }: { severity: AdvisorySeverity; className: string }) {
  const Component =
    severity === 'critical' ? WarningOctagon : severity === 'warn' ? Warning : Info;
  return <Component aria-hidden="true" className={className} />;
}

export function AdvisoryBanner({ readOnly = false, onReview, className = '' }: AdvisoryBannerProps) {
  const advisories = useAppStore((s) => s.advisories);
  const advisory = pickHighestSeverity(advisories, readOnly);
  if (!advisory) return null;

  const tone = TONE[advisory.severity];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 rounded border ${tone.ring} px-3 py-2 ${className}`}
    >
      <Icon severity={advisory.severity} className={`h-4 w-4 mt-0.5 flex-shrink-0 ${tone.icon}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${tone.text}`}>{advisory.summary}</div>
        {advisory.detail && (
          <div className={`mt-0.5 text-xs ${tone.text} opacity-80`}>{advisory.detail}</div>
        )}
      </div>
      {!readOnly && advisory.suggestedAction && onReview && (
        <button
          type="button"
          onClick={() => onReview(advisory)}
          className={`flex-shrink-0 rounded border border-current px-2 py-1 text-xs font-medium ${tone.text} hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-current`}
        >
          Review
        </button>
      )}
    </div>
  );
}
