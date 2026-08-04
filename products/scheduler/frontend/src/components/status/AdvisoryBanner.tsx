/**
 * Pending-decision banner.
 *
 * The single alert pipeline routes advisories to exactly one place by
 * severity (SPEC_AMENDMENT_alerts_activity_panel.md §2). This banner is
 * the **decision** sink: it surfaces the one highest-priority advisory
 * that is a proposal awaiting the operator (Repair / Apply / Re-optimize /
 * warm-restart), persisting until acted on. Warnings and info go to the
 * Alerts & Activity rail, never here — so an event never renders twice.
 *
 * At most one decision shows; additional queued decisions collapse to a
 * "+N more" count. Built on the shared `Notice` grammar.
 */
import { Button, Notice } from '@scheduler/design-system/components';
import { useUiStore } from '../../store/uiStore';
import { classifyAdvisory } from '../../platform/domain/alertModel';
import type { Advisory } from '../../api/dto';

interface AdvisoryBannerProps {
  /** When true, show the message only (no Review button) — e.g. a
   *  read-only spectator surface. */
  readOnly?: boolean;
  /** Handler for the Review button — routes the advisory's suggestedAction
   *  to the matching dialog. */
  onReview?: (advisory: Advisory) => void;
  className?: string;
}

export function AdvisoryBanner({ readOnly = false, onReview, className = '' }: AdvisoryBannerProps) {
  const advisories = useUiStore((s) => s.advisories);
  const decisions = advisories
    .filter((a) => classifyAdvisory(a) === 'decision')
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

  if (decisions.length === 0) return null;
  const top = decisions[0];
  const extra = decisions.length - 1;

  return (
    <Notice
      tone="accent"
      placement="full-bleed"
      className={`motion-enter ${className}`}
      title={top.summary}
      action={
        <div className="flex items-center gap-2">
          {extra > 0 && (
            <span className="whitespace-nowrap text-2xs font-medium text-muted-foreground tabular-nums">
              +{extra} more
            </span>
          )}
          {!readOnly && top.suggestedAction && onReview && (
            <Button type="button" size="xs" variant="outline" onClick={() => onReview(top)}>
              Review
            </Button>
          )}
        </div>
      }
    >
      {top.detail ?? undefined}
    </Notice>
  );
}
