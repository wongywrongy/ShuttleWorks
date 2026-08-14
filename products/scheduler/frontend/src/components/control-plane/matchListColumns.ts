/**
 * The column geometry shared by Meet Matches and Bracket Matches. Anatomy:
 * warning-icon gutter (Meet) / spacer (Bracket) · per-group `#` · event code
 * · two flex-[3] sides · Status · trailing action gutter (Meet: delete
 * button, Bracket: contingency menu). One spec so the two surfaces cannot
 * drift; the parity test pins usage.
 *
 * ONE column is parameterised: the event code. Its width is the only thing
 * the two lists genuinely disagree about, because they write different
 * strings into it:
 *
 *   Meet    an event rank    "XD11"      worst case  4 chars
 *   Bracket a play-unit label "XDC L R327" worst case 10 chars
 *             ({discipline} {segment?} {stage}{index} — bracketLabels.ts)
 *
 * A single `w-20` (80px) served neither. Bracket's cell has a `px-1.5` inset,
 * leaving 68px of content for a 10-char `text-sm font-semibold` label (~81px),
 * so "WDC R16C" split at its space and the row went to two lines — an
 * identifier broken across lines is wrong even inside a uniform row, and it
 * spends the line reservation on nothing. Meet, writing 4 chars into the same
 * 80px, was over-allocated by ~32px taken from the name columns.
 *
 * So the width is derived per list from that list's own label vocabulary, and
 * everything else stays shared. Wrapping stays the last resort rather than
 * `whitespace-nowrap`: an unexpectedly long operator discipline code must
 * grow the row, never overflow into the next cell. The widths below are sized
 * so nothing in the measured vocabulary reaches that point, and
 * `bandedRowGeometry.test.ts` pins them against those measurements so a
 * vocabulary that outgrows them fails loudly.
 *
 * MATCH_CELL — the per-column CELL class strings (geometry + priority
 * visibility) row cells must consume instead of re-declaring raw width
 * classes; the parity test pins this too.
 *
 * Priorities: `#` and `Status` collapse first when the surface narrows
 * (docked detail pane open, small window) — the sides and event code are
 * what operators actually read. Requires the surface's scroll wrapper to
 * be `@container/table`.
 */
import type { BandedListColumn } from './BandedList';
import { NAME_COL_MIN, colClass } from './BandedList';
import { dockMinContentWidth } from './bandedDockWidth';

/** Event column for Meet: 4 chars ("XD11") at `text-sm font-semibold` is
 *  ~33px, and the "unset" placeholder at `text-xs` is ~33px too. 48px holds
 *  either with ~2 chars of headroom, and hands the other 32px of the old
 *  `w-20` back to Side A / Side B. */
export const MEET_EVENT_COL = 'w-12';

/** Event column for Bracket: 10 chars ("XDC L R327") at `text-sm
 *  font-semibold` is ~81px, plus the cell's `px-1.5` pair = ~93px. 112px
 *  holds ~12 chars of content — the measured worst case plus two, because
 *  the discipline code is operator data and nothing stops it being longer
 *  than "XDC". */
export const BRACKET_EVENT_COL = 'w-28';

// Fixed-width cells are `shrink-0`: they are flex items, and without it a
// docked detail pane squeezing the row CRUSHES them — their content then
// overflows onto the neighboring cells. Only the two flex sides give way, and
// they give way down to `NAME_COL_MIN`, not to zero: `min-w-0` let both sides
// reach ~145px at the old dock floor, which is where the doubles pairings
// started shredding into ribbons.
// No ordinal `#` column (SP-CONSOLE-REFINE G6): the row's identity is its
// event code / play-unit label; a per-group counter carried no information.
// Status is `w-28` because on DONE rows it is the SCORE LANE — up to three
// `w-9` set pairs ("21-15 21-17 21-19") right-aligned so sets line up
// vertically down the list.
const matchListColumns = (eventColWidth: string): BandedListColumn[] => [
  { label: '', className: 'w-4 shrink-0' },
  { label: 'Event', className: `${eventColWidth} shrink-0` },
  { label: 'Side A', className: `${NAME_COL_MIN} flex-[3]` },
  { label: 'Side B', className: `${NAME_COL_MIN} flex-[3]` },
  { label: 'Status', className: 'w-28 shrink-0 text-right', priority: 2 },
  { label: '', className: 'w-8 shrink-0' },
];

export const MEET_MATCH_LIST_COLUMNS = matchListColumns(MEET_EVENT_COL);
export const BRACKET_MATCH_LIST_COLUMNS = matchListColumns(BRACKET_EVENT_COL);

/** Content floor for each match list's `DetailDock`, derived from its own
 *  columns rather than hand-picked — see `bandedDockWidth.ts`. They differ
 *  only by the event column: Meet lands on the 672 `@2xl` tier its `#` and
 *  `Status` columns query, Bracket on its own 712px column sum. */
export const MEET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH = dockMinContentWidth(
  MEET_MATCH_LIST_COLUMNS,
);
export const BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH = dockMinContentWidth(
  BRACKET_MATCH_LIST_COLUMNS,
);

const matchCell = (columns: BandedListColumn[]) =>
  ({
    warnGutter: colClass(columns[0]),
    event: colClass(columns[1]),
    side: colClass(columns[2]),
    status: colClass(columns[4]),
    actionGutter: colClass(columns[5]),
  }) as const;

export const MEET_MATCH_CELL = matchCell(MEET_MATCH_LIST_COLUMNS);
export const BRACKET_MATCH_CELL = matchCell(BRACKET_MATCH_LIST_COLUMNS);
