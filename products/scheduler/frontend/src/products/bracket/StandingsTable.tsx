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
  NAME_COL_MIN,
  ColumnHeaderRow,
  bandedRowClasses,
} from "../../components/control-plane";
import { EYEBROW_CLASS } from '../../lib/utils';
import { STANDINGS_COLUMNS } from './standingsColumns';


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
        <span className={`${EYEBROW_CLASS} text-ink-3`}>Standings</span>
      </div>
      {/* ColumnHeaderRow publishes role="row"/"columnheader", so this
          surface — which composes its own rows out of the row shell rather
          than going through BandedTable — has to supply the role="table"
          they live in. */}
      <div role="table" aria-colcount={STANDINGS_COLUMNS.length}>
        <div role="rowgroup">
          <ColumnHeaderRow columns={STANDINGS_COLUMNS} />
        </div>
        <div role="rowgroup">
          {ordered.map((row) => {
            const leader = row.position === 1;
            return (
              <div
                key={row.participant_id}
                role="row"
                data-testid={`standings-row-${row.position}`}
                className={`${bandedRowClasses(STANDINGS_COLUMNS)} last:border-b-0`}
              >
                <span
                  role="cell"
                  data-testid={leader ? "standings-pos-1" : undefined}
                  className={`w-7 shrink-0 text-xs sw-num ${
                    leader
                      ? "font-semibold text-accent"
                      : "text-muted-foreground"
                  }`}
                >
                  {row.position}
                </span>
                <span
                  role="cell"
                  className={`${NAME_COL_MIN} flex-1 break-words text-sm text-card-foreground`}
                >
                  {nameById[row.participant_id] ?? row.participant_id}
                </span>
                <span
                  role="cell"
                  className="w-9 shrink-0 text-right text-xs font-medium text-card-foreground sw-num"
                >
                  {row.wins}–{row.losses}
                </span>
                <span
                  role="cell"
                  className="w-11 shrink-0 text-right text-xs text-muted-foreground sw-num"
                >
                  {row.games_won}–{row.games_lost}
                </span>
                <span
                  role="cell"
                  className="w-12 shrink-0 text-right text-xs text-muted-foreground sw-num"
                >
                  {row.points_won}–{row.points_lost}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
