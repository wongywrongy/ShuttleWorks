import type { ReactNode } from 'react';
import { Info, Warning, WarningOctagon, CheckCircle, Lightning } from '@phosphor-icons/react';

import { cn } from '../lib/utils';

/**
 * Notice — the one tone×message grammar for alerts, banners, and rail
 * entries. Pick a `tone`, optionally a `title`, a right-aligned `action`
 * slot, and a `placement`:
 *
 *   - `inline`     → a rounded, bordered card (rail entry / in-flow notice)
 *   - `full-bleed` → a flush banner (bottom hairline, no side radius) for
 *                    the tier-1 pending-decision row at the top of a view
 *
 * Tone pairs draw from the semantic --status-*-fg / --status-*-bg tokens
 * so a Notice re-themes with everything else; `accent` is the "decision"
 * treatment (a proposal awaiting the operator). Color is always paired
 * with an icon + text — never color alone (DESIGN_SPEC never-color-alone).
 */

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success' | 'accent';

const TONE: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: {
    box: 'border-status-info-fg/30 bg-status-info-bg text-status-info-fg',
    icon: 'text-status-info-fg',
    Icon: Info,
  },
  warning: {
    box: 'border-status-warning-fg/40 bg-status-warning-bg text-status-warning-fg',
    icon: 'text-status-warning-fg',
    Icon: Warning,
  },
  danger: {
    box: 'border-status-danger-fg/40 bg-status-danger-bg text-status-danger-fg',
    icon: 'text-status-danger-fg',
    Icon: WarningOctagon,
  },
  success: {
    box: 'border-status-success-fg/30 bg-status-success-bg text-status-success-fg',
    icon: 'text-status-success-fg',
    Icon: CheckCircle,
  },
  accent: {
    box: 'border-accent/40 bg-accent/10 text-foreground',
    icon: 'text-accent',
    Icon: Lightning,
  },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  /** Override the default tone icon. Pass `null` to hide the icon. */
  icon?: ReactNode;
  /** Right-aligned action slot (e.g. a Button or Review link). */
  action?: ReactNode;
  placement?: 'inline' | 'full-bleed';
  className?: string;
  children?: ReactNode;
}

export function Notice({
  tone = 'info',
  title,
  icon,
  action,
  placement = 'inline',
  className,
  children,
}: NoticeProps) {
  const t = TONE[tone];
  const DefaultIcon = t.Icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 border px-3 py-2',
        placement === 'full-bleed' ? 'border-x-0 border-t-0' : 'rounded',
        t.box,
        className,
      )}
    >
      {icon !== null &&
        (icon ?? (
          <DefaultIcon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 flex-shrink-0', t.icon)} />
        ))}
      <div className="min-w-0 flex-1">
        {title && <div className="text-sm font-medium">{title}</div>}
        {children && <div className={cn('text-xs', title ? 'mt-0.5' : '')}>{children}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
