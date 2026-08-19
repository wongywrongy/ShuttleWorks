/**
 * The standings column spec, in its own module.
 *
 * It lives here rather than beside the component for one mechanical reason:
 * `react-refresh/only-export-components` fires on a non-component export from
 * a `.tsx` component file, and the spec has to be importable because the
 * geometry tests derive the rail width from it (`dockMinContentWidth`) rather
 * than restating a number the component could drift away from. Same move
 * `dockMode.ts` made for `DockModeContext`, and for the same reason.
 *
 * Numeric columns stay tight (two 2-digit numbers plus an en-dash at text-xs)
 * so the flex-1 Player cell keeps real width even in the xl side rail.
 *
 * Player carries a NAME. `Participant.name` is a player OR a team, so
 * "Nashville Badminton Association" is in-vocabulary here exactly as it is on
 * the Hub. It therefore floors at `NAME_COL_MIN` like every other name column,
 * and its rows reserve two lines (`bandedRowClasses` derives that from this
 * spec). `min-w-0` let it reach ~106px in the xl rail: three lines for an org
 * name, and one short word away from the "Nashville / Badminto / n" mid-word
 * break that was a real defect on this very surface. The rail is sized to hold
 * this floor, pinned by `StandingsTable.test.tsx` against
 * `dockMinContentWidth(STANDINGS_COLUMNS)`.
 */
import { NAME_COL_MIN, type BandedListColumn } from '../../components/control-plane';

export const STANDINGS_COLUMNS: BandedListColumn[] = [
  { label: 'Pos', className: 'w-7 shrink-0' },
  // `bandedRowGeometry.test.ts` scans for this line by its marker; the spec
  // moved here from StandingsTable.tsx and the scan moved with it.
  { label: 'Player', className: `${NAME_COL_MIN} flex-1` },
  { label: 'W–L', className: 'w-9 shrink-0 text-right' },
  { label: 'Games', className: 'w-11 shrink-0 text-right' },
  { label: 'Points', className: 'w-12 shrink-0 text-right' },
];
