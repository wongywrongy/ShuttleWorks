/**
 * StandingsTable — BandedList-grammar standings for has-standings draw
 * formats (round robin / Swiss / group pools). The BWF tie-break chain is
 * applied backend-side (`services/bracket/standings.py`); rows arrive with
 * a resolved `position`, so this table only orders by it and renders.
 *
 * Columns: Pos · Player · W–L · Games · Points. Position 1 carries a
 * subtle accent on its Pos cell (the table's single hero datum).
 */
import type { StandingRowDTO } from "../../api/bracketDto";
import {
  BANDED_ROW_CLASSES,
  ColumnHeaderRow,
  type BandedListColumn,
} from "../../components/control-plane";
import { EYEBROW_CLASS } from '../../lib/utils';

// Numeric columns stay tight (two 2-digit numbers + en-dash at text-xs)
// so the flex-1 Player cell keeps real width even in the xl side rail.
const COLUMNS: BandedListColumn[] = [
  { label: "Pos", className: "w-7 shrink-0" },
  { label: "Player", className: "min-w-0 flex-1" },
  { label: "W–L", className: "w-9 shrink-0 text-right" },
  { label: "Games", className: "w-11 shrink-0 text-right" },
  { label: "Points", className: "w-12 shrink-0 text-right" },
];

export function StandingsTable({
  rows,
  nameById,
}: {
  rows: StandingRowDTO[];
  /** participant_id → display name (falls back to the raw id). */
  nameById: Record<string, string>;
}) {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  return (
    <div
      data-testid="standings-table"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-2">
        <span className={`${EYEBROW_CLASS} text-ink-3`}>
          Standings
        </span>
      </div>
      <ColumnHeaderRow columns={COLUMNS} />
      {ordered.map((row) => {
        const leader = row.position === 1;
        return (
          <div
            key={row.participant_id}
            data-testid={`standings-row-${row.position}`}
            className={`${BANDED_ROW_CLASSES} last:border-b-0`}
          >
            <span
              data-testid={leader ? "standings-pos-1" : undefined}
              className={`w-7 shrink-0 text-xs sw-num ${
                leader ? "font-semibold text-accent" : "text-muted-foreground"
              }`}
            >
              {row.position}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-card-foreground">
              {nameById[row.participant_id] ?? row.participant_id}
            </span>
            <span className="w-9 shrink-0 text-right text-xs font-medium text-card-foreground sw-num">
              {row.wins}–{row.losses}
            </span>
            <span className="w-11 shrink-0 text-right text-xs text-muted-foreground sw-num">
              {row.games_won}–{row.games_lost}
            </span>
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground sw-num">
              {row.points_won}–{row.points_lost}
            </span>
          </div>
        );
      })}
    </div>
  );
}
