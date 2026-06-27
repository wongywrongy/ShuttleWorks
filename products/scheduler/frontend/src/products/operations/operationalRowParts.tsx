/**
 * Shared row primitives for the unified Operations surfaces (Courts +
 * Live). Both surfaces render the same `OperationalMatch` shape, so the
 * provenance chip, court/slot stamp, side labels, and status pill live
 * here once and are composed by each surface.
 */
import type { OperationalMatch, OperationalStatus } from '../../lib/operations/operationalMatch';

const STATUS_LABEL: Record<OperationalStatus, string> = {
  scheduled: 'Scheduled',
  called: 'Called to court',
  started: 'Started',
  finished: 'Finished',
};

const STATUS_TONE: Record<OperationalStatus, string> = {
  scheduled: 'border-border bg-card text-muted-foreground',
  called: 'border-status-called/40 bg-status-called/10 text-status-called',
  started: 'border-status-live/40 bg-status-live/10 text-status-live',
  finished: 'border-status-done/40 bg-status-done/10 text-muted-foreground',
};

export function StatusPill({ status }: { status: OperationalStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-2xs font-medium ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Court + slot stamp, or a "Waiting" placeholder for unassigned rows. */
export function CourtSlot({ row }: { row: OperationalMatch }) {
  if (row.courtLabel == null) {
    return <span className="text-2xs uppercase tracking-[0.18em] text-muted-foreground/70">Waiting</span>;
  }
  return (
    <span className="font-mono text-xs tracking-[0.12em] text-foreground">
      {row.courtLabel}
      {row.slot != null ? <span className="text-muted-foreground"> · slot {row.slot}</span> : null}
    </span>
  );
}

/** The two side names with a vs separator. */
export function SideLabels({ row }: { row: OperationalMatch }) {
  return (
    <span className="min-w-0 truncate text-sm text-foreground">
      <span>{row.sideA}</span>
      <span className="px-1.5 text-muted-foreground/60">vs</span>
      <span>{row.sideB}</span>
    </span>
  );
}
