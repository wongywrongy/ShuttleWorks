/**
 * Alerts & Activity panel — the rail's top section on the Run view
 * (SPEC_AMENDMENT_alerts_activity_panel.md §4). Always present; hosts
 * warning conditions + the info activity trail as one timestamped feed
 * (newest first). Collapsible to a count chip, never silent.
 *
 * Reads the alert store independently so a poll/activity tick re-renders
 * only this panel, not the queue or timeline (§7). Relative timestamps
 * refresh on ONE shared 30s interval, not a timer per row.
 */
import { useEffect, useState } from 'react';
import { Warning, Info, CaretDown, CaretRight } from '@phosphor-icons/react';
import { useAlertStore } from '../../../store/alertStore';
import { sortPanel, type AlertEntry } from '../../../platform/domain/alertModel';
import type { Advisory } from '../../../api/dto';

interface AlertsActivityPanelProps {
  onReview?: (advisory: Advisory) => void;
  /** Height behaviour in the bounded rail column. The parent caps the
   *  panel when Match Details is open (so a long trail can't squeeze
   *  Details to a sliver) and lets it fill when Details is collapsed. */
  className?: string;
}

function relativeTime(ts: string, nowMs: number): string {
  const then = Date.parse(ts);
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((nowMs - then) / 1000));
  if (secs < 10) return 'now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

function EntryRow({
  entry,
  nowMs,
  onReview,
}: {
  entry: AlertEntry;
  nowMs: number;
  onReview?: (advisory: Advisory) => void;
}) {
  const isWarning = entry.severity === 'warning';
  const Icon = isWarning ? Warning : Info;
  const canReview = !!entry.advisory?.suggestedAction && !!onReview;
  return (
    <li className="flex items-start gap-2 px-4 py-2">
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${
          isWarning ? 'text-status-warning-fg' : 'text-muted-foreground'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-xs font-medium ${
              isWarning ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {entry.title}
          </span>
          <span className="flex-shrink-0 text-3xs tabular-nums text-muted-foreground">
            {relativeTime(entry.ts, nowMs)}
          </span>
        </div>
        {entry.message && (
          <div className="mt-0.5 text-2xs text-muted-foreground">{entry.message}</div>
        )}
        {canReview && (
          <button
            type="button"
            onClick={() => onReview!(entry.advisory!)}
            className="mt-1 rounded border border-status-warning-fg/40 px-1.5 py-0.5 text-2xs font-medium text-status-warning-fg hover:bg-status-warning-bg focus:outline-none focus:ring-2 focus:ring-status-warning-fg"
          >
            Review
          </button>
        )}
      </div>
    </li>
  );
}

export function AlertsActivityPanel({ onReview, className = '' }: AlertsActivityPanelProps) {
  const conditions = useAlertStore((s) => s.conditions);
  const activity = useAlertStore((s) => s.activity);
  const [collapsed, setCollapsed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // One shared interval refreshes every row's relative time.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const entries = sortPanel([...Object.values(conditions), ...activity]);
  const warningCount = Object.values(conditions).filter((e) => e.severity === 'warning').length;

  return (
    <div className={`flex min-h-0 flex-col border-b border-border ${className}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex flex-shrink-0 items-center justify-between gap-2 px-4 py-2 text-left hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {collapsed ? (
            <CaretRight aria-hidden="true" className="h-3 w-3" />
          ) : (
            <CaretDown aria-hidden="true" className="h-3 w-3" />
          )}
          Alerts &amp; Activity
        </span>
        {warningCount > 0 && (
          <span className="rounded-sm border border-status-warning-fg/40 bg-status-warning-bg px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-status-warning-fg">
            {warningCount}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-4 py-3 text-2xs text-muted-foreground">No alerts or activity yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} nowMs={nowMs} onReview={onReview} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
