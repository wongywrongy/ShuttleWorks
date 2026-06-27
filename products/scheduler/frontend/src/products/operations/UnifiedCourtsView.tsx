/**
 * UnifiedCourtsView — the both-engines Operations "Courts" surface.
 *
 * When Meet and Bracket are both enabled, this single court view
 * concatenates `meetMatchesToOperational(...)` + `bracketToOperational(...)`
 * (via `mergeOperational`) and lists the two engines' rows interleaved by
 * court then slot. Every row carries a per-row `SourceChip` keyed on its
 * `OperationalMatch.source`, so a mixed list still reads apart at a glance.
 *
 * Courts is the read-oriented spatial overview (which match is on which
 * court, when). Operator write-back lives on the Live surface.
 */
import type { OperationalMatch } from '../../lib/operations/operationalMatch';
import { mergeOperational } from '../../lib/operations/operationalMatch';
import { SourceChip } from './SourceChip';
import { UnifiedCourtBoard } from './UnifiedCourtBoard';
import { CourtSlot, SideLabels, StatusPill } from './operationalRowParts';

interface Props {
  meet: OperationalMatch[];
  bracket: OperationalMatch[];
}

export function UnifiedCourtsView({ meet, bracket }: Props) {
  const rows = mergeOperational(meet, bracket);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Courts
          </span>
          <span className="text-xs text-muted-foreground/70">
            Meet and Bracket matches on one court plan
          </span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">
          No matches scheduled yet. Generate a schedule in Meet or draws in Bracket to populate the courts.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {/* The court×time board — the spatial map operators run from. */}
          <UnifiedCourtBoard rows={rows} />
          <ul className="divide-y divide-rule-soft">
            {rows.map((row) => (
              <li
                key={`${row.source}-${row.id}`}
                data-testid="ops-row"
                data-row-id={row.id}
                data-source={row.source}
                className="flex items-center gap-3 px-4 py-2"
              >
                <SourceChip source={row.source} className="shrink-0" />
                <span className="w-28 shrink-0">
                  <CourtSlot row={row} />
                </span>
                <span className="min-w-0 flex-1">
                  <SideLabels row={row} />
                </span>
                <StatusPill status={row.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
