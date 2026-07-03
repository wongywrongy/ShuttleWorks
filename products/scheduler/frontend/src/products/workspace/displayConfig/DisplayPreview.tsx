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
 * LAYOUT (mode/columns/size/scores), not live results. `standingsMode` has no
 * visible effect here — no board reads it yet (see DisplayLayoutEditor's
 * doc comment; Task 9 wires panel-vs-rotate rendering).
 *
 * The sizing derivation below (cardHeightPx/SIZES/GRID_COLS/tvAccent) is
 * mirrored from `MeetDisplayPage.tsx` (~lines 264-305), deliberately NOT
 * extracted into a shared helper — that extraction belongs to the Task 7/8
 * board-layout work, not this one.
 */
import type { TournamentConfig, MatchDTO, MatchStateDTO } from '../../../api/dto';
import { CourtsView } from '../../display/publicDisplay/CourtsView';
import { DEFAULT_PRESET_ID } from '../../display/publicDisplay/displayPresets';

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
  const tvAccent =
    config.tvAccent && /^#?[0-9a-fA-F]{6}$/.test(config.tvAccent.replace(/^#/, ''))
      ? config.tvAccent.startsWith('#')
        ? config.tvAccent
        : `#${config.tvAccent}`
      : '#10b981';
  const tvGridColumns = config.tvGridColumns ?? null;
  const tvCardSize = config.tvCardSize ?? 'auto';
  const tvShowScores = config.tvShowScores !== false;

  const cardHeightPx =
    tvCardSize === 'compact'
      ? 72
      : tvCardSize === 'comfortable'
        ? 128
        : tvCardSize === 'large'
          ? 176
          : 96;
  const sizeTier =
    cardHeightPx >= 160 ? 'xl' : cardHeightPx >= 120 ? 'lg' : cardHeightPx >= 96 ? 'md' : 'sm';
  const SIZES = {
    sm: { courtNum: 'text-3xl tracking-tight', eventCode: 'text-base', player: 'text-base', padX: 'px-4' },
    md: { courtNum: 'text-5xl tracking-tighter', eventCode: 'text-2xl', player: 'text-2xl', padX: 'px-4' },
    lg: { courtNum: 'text-6xl tracking-tighter', eventCode: 'text-3xl', player: 'text-3xl', padX: 'px-6' },
    xl: { courtNum: 'text-7xl tracking-tighter', eventCode: 'text-4xl', player: 'text-4xl', padX: 'px-6' },
  } as const;
  const { courtNum: courtNumSize, eventCode: eventCodeSize, player: playerSize, padX: cardPadX } =
    SIZES[sizeTier];
  const GRID_COLS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };
  const gridColsClass = (tvGridColumns && GRID_COLS[tvGridColumns]) || GRID_COLS[2];

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
          courts={buildSampleCourts(now)}
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
