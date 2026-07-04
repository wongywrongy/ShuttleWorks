/**
 * DisplayPreview — a scaled-down mirror of the Meet public board's courts
 * view, driven by the SAME `config` the operator is editing in
 * `DisplayLayoutEditor`.
 *
 * True live-draft preview, no board refactor: `setConfig` (Zustand) writes
 * synchronously — only the network PUT to `/tournament-state` is debounced
 * (see `useTournamentState.ts`). So a component that reads `config` straight
 * off `useTournamentStore` already reflects unsaved edits the instant they
 * happen; there is no separate "draft" layer to plumb through. `DisplayConfig`
 * subscribes to the store and passes `config` down — this component stays a
 * pure `config in -> render out` view.
 *
 * Reuses `CourtsView` (the board's actual presentational card renderer) over
 * a small FIXED sample-courts fixture rather than real schedule/match data:
 * a fresh or schedule-less workspace would otherwise preview nothing (just
 * the board's "no schedule" placeholder), and the point here is to preview
 * LAYOUT (mode/columns/size/scores), not live results. `standingsMode` still
 * has no visible effect here — `MeetDisplayPage` renders it now (Task 9's
 * panel-vs-rotate wiring; see DisplayLayoutEditor's doc comment), but this
 * swatch's fixed sample fixture carries no roster groups to derive
 * standings from, and courts-only layout preview remains this component's
 * whole job (see the file doc comment above) — not a gap introduced by
 * Task 9, a pre-existing scope boundary.
 *
 * The sizing derivation (cardHeightPx/SIZES/GRID_COLS/tvAccent) used to be
 * mirrored verbatim from `MeetDisplayPage.tsx`; both now consume the shared
 * `publicDisplay/tvSizing.ts` helpers (task 7) so the two boards can't drift.
 *
 * Deliberately does NOT apply `courtOrder`/`hiddenCourts` to the sample
 * fixture below — those are real-court-identity concepts and this fixture
 * is a FIXED 4-court sample decoupled from the workspace's actual
 * `courtCount` (see buildSampleCourts). Applying them here could hide the
 * entire preview (e.g. hiddenCourts covering 1-4 while the real board has
 * 10 courts) or silently no-op (an order referencing courts 5+), neither of
 * which previews anything useful. The director already gets accurate
 * order/hide feedback from the editor's own reorderable court list. Column
 * count IS a plain layout property, not a court-identity one, so
 * `defaultColumns` applies here same as the real board.
 */
import type { TournamentConfig, MatchDTO, MatchStateDTO } from '../../../api/dto';
import { CourtsView } from '../../display/publicDisplay/CourtsView';
import { DEFAULT_PRESET_ID } from '../../display/publicDisplay/displayPresets';
import { defaultColumns } from '../../display/publicDisplay/courtLayout';
import {
  resolveTvAccent,
  resolveCardHeightPx,
  resolveCardSizeClasses,
  resolveGridColsClass,
} from '../../display/publicDisplay/tvSizing';

// Natural (unscaled) render box for the sample board, then shrunk into a
// bordered "TV bezel" frame via CSS transform — the wrapper's actual
// on-page footprint is the post-scale size (transform doesn't affect
// layout, so the outer box is sized explicitly to match).
const NATURAL_WIDTH = 960;
const NATURAL_HEIGHT = 460;
const SCALE = 0.5;

const SAMPLE_PLAYER_NAMES = new Map<string, string>([
  ['p1', 'A. Ntumba'],
  ['p2', 'D. Reyes'],
  ['p3', 'M. Okafor'],
  ['p4', 'S. Lindqvist'],
  ['p5', 'J. Park'],
  ['p6', 'R. Haddad'],
]);

function buildSampleCourts(now: Date): {
  courtId: number;
  match: MatchDTO | null;
  state: MatchStateDTO | null;
  status: 'active' | 'called' | 'empty';
  nextMatch?: MatchDTO | null;
  nextStartTime?: string;
}[] {
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
  return [
    {
      courtId: 1,
      status: 'active',
      match: {
        id: 'sample-1',
        matchNumber: 1,
        sideA: ['p1'],
        sideB: ['p2'],
        eventRank: 'MS1',
        durationSlots: 1,
      },
      state: {
        matchId: 'sample-1',
        status: 'started',
        actualStartTime: fiveMinAgo,
        score: { sideA: 11, sideB: 7 },
      },
    },
    {
      courtId: 2,
      status: 'called',
      match: {
        id: 'sample-2',
        matchNumber: 2,
        sideA: ['p3'],
        sideB: ['p4'],
        eventRank: 'WS1',
        durationSlots: 1,
      },
      state: { matchId: 'sample-2', status: 'called' },
    },
    {
      courtId: 3,
      status: 'empty',
      match: null,
      state: null,
      nextMatch: {
        id: 'sample-3',
        matchNumber: 3,
        sideA: ['p5'],
        sideB: ['p6'],
        eventRank: 'MD1',
        durationSlots: 1,
      },
      nextStartTime: '2:30 PM',
    },
    {
      courtId: 4,
      status: 'empty',
      match: null,
      state: null,
    },
  ];
}

export function DisplayPreview({ config }: { config: TournamentConfig | null }) {
  if (!config) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        Nothing to preview yet.
      </div>
    );
  }

  const now = new Date();
  const tvPreset = config.tvPreset ?? DEFAULT_PRESET_ID;
  const tvDisplayMode: 'strip' | 'grid' | 'list' = config.tvDisplayMode ?? 'strip';
  const tvAccent = resolveTvAccent(config.tvAccent);
  const tvCardSize = config.tvCardSize ?? 'auto';
  const tvShowScores = config.tvShowScores !== false;

  const cardHeightPx = resolveCardHeightPx(tvCardSize);
  const { courtNumSize, eventCodeSize, playerSize, cardPadX } = resolveCardSizeClasses(cardHeightPx);
  // Column count is a plain layout property (unlike hide/order, which are
  // court-identity concepts this fixed sample fixture doesn't carry — see
  // the file doc comment above), so the same responsive default applies.
  const sampleCourts = buildSampleCourts(now);
  const resolvedColumns = defaultColumns(sampleCourts.length, config.tvGridColumns ?? null);
  const gridColsClass = resolveGridColsClass(resolvedColumns);

  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-card/40"
      style={{ width: NATURAL_WIDTH * SCALE, height: NATURAL_HEIGHT * SCALE }}
      aria-label="Board layout preview"
      data-testid="display-preview-frame"
    >
      <div
        data-tv-preset={tvPreset}
        className="bg-background text-foreground"
        style={{
          width: NATURAL_WIDTH,
          height: NATURAL_HEIGHT,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          padding: 24,
          overflow: 'hidden',
        }}
      >
        <CourtsView
          courts={sampleCourts}
          config={config}
          now={now}
          displayMode={tvDisplayMode}
          gridColsClass={gridColsClass}
          cardHeightPx={cardHeightPx}
          cardPadX={cardPadX}
          courtNumSize={courtNumSize}
          eventCodeSize={eventCodeSize}
          playerSize={playerSize}
          tvAccent={tvAccent}
          tvShowScores={tvShowScores}
          isFullscreen={false}
          playerNames={SAMPLE_PLAYER_NAMES}
        />
      </div>
    </div>
  );
}
