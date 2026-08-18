/**
 * SP-CONSOLE-4 C4 — the meet Run migrations.
 *
 * Covers, per migrated capability:
 *   - MeetMatchPanel: score entry via the shared ScoreEditor →
 *     `updateMatchStatus('finished', {score…})` + record completion;
 *     undo-start (restore + back to scheduled, start stamp cleared);
 *     check-in pills + "All in"; substitute picker; armed remove;
 *     shared-player impact rows.
 *   - RunFinished: recorded rows with score readout; armed undo-finish
 *     (finished → started, score discarded); bracket rows read-only.
 *   - RunSurface integration: the meet rail + Finished section mount from
 *     the `meetOps` seam, and the inspector's static player list yields to
 *     the interactive one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetMatchPanel } from '../run/MeetMatchPanel';
import { RunFinished } from '../run/RunFinished';
import { RunSurface } from '../run/RunSurface';
import type { MeetRunOps } from '../run/useMeetRunOps';
import type { RunMatch } from '../runtime/runModel';
import type { OpsBlock } from '../opsBlock';
import type { MatchStateDTO } from '../../../api/dto';

// Write gate: these are operator surfaces; the tests exercise the editable path.
vi.mock('../../../hooks/useCanEdit', () => ({
  useCanEdit: () => true,
}));

// RunSurface seam hooks (integration section) — same shape as runSurface.test.
vi.mock('../../../hooks/useCommandQueue', () => ({
  useCommandQueue: () => ({ submit: vi.fn() }),
}));
vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    matchAction: vi.fn().mockResolvedValue({}),
    assignCourt: vi.fn().mockResolvedValue({}),
    unassign: vi.fn().mockResolvedValue({}),
  }),
}));
vi.mock('../../../hooks/useBracketResultQueue', () => ({
  useBracketResultQueue: () => ({ submit: vi.fn() }),
}));

// ── helpers ───────────────────────────────────────────────────────────────

function mkRunMatch(
  overrides: Partial<RunMatch> & Pick<RunMatch, 'key' | 'id' | 'source'>,
): RunMatch {
  return {
    label: overrides.key,
    sideA: 'Alice',
    sideB: 'Bob',
    span: 1,
    status: 'playing',
    late: false,
    timeliness: 'ontime',
    eligible: true,
    ...overrides,
  };
}

function mkOps(overrides?: {
  matchStates?: Record<string, MatchStateDTO>;
  analyzeImpact?: MeetRunOps['analyzeImpact'];
}): MeetRunOps & {
  updateMatchStatus: ReturnType<typeof vi.fn>;
  confirmPlayer: ReturnType<typeof vi.fn>;
  substitutePlayer: ReturnType<typeof vi.fn>;
  removePlayer: ReturnType<typeof vi.fn>;
  undoStart: ReturnType<typeof vi.fn>;
} {
  return {
    matches: [
      { id: 'm1', sideA: ['p1'], sideB: ['p2'], matchNumber: 1 },
      { id: 'm2', sideA: ['p1'], sideB: ['p3'], matchNumber: 2, eventRank: 'MS2' },
    // Loose DTO fixtures: only the fields the panel reads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    matchStates: overrides?.matchStates ?? {
      m1: { matchId: 'm1', status: 'started' },
    },
    players: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Cara' },
      { id: 'p9', name: 'Zoe' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    config: null,
    updateMatchStatus: vi.fn().mockResolvedValue(undefined),
    confirmPlayer: vi.fn().mockResolvedValue(undefined),
    substitutePlayer: vi.fn(),
    removePlayer: vi.fn(),
    undoStart: vi.fn(),
    analyzeImpact: overrides?.analyzeImpact ?? (() => null),
  };
}

const m1 = () => mkRunMatch({ key: 'meet:m1', id: 'm1', source: 'meet' });

beforeEach(() => vi.clearAllMocks());

// ── MeetMatchPanel — score entry ──────────────────────────────────────────

describe('MeetMatchPanel — score entry', () => {
  it('saves a quick score through updateMatchStatus and fires record completion', async () => {
    const ops = mkOps();
    const onFinished = vi.fn();
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={onFinished} />);

    fireEvent.click(screen.getByTestId('meet-run-enter-score'));
    fireEvent.change(screen.getByLabelText('Score for Alice'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Score for Bob'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(ops.updateMatchStatus).toHaveBeenCalledWith('m1', 'finished', {
        score: { sideA: 21, sideB: 15 },
        sets: undefined,
        notes: undefined,
      }),
    );
    await waitFor(() => expect(onFinished).toHaveBeenCalled());
  });

  it('offers score entry from called too (skip-ahead) — the state route walks the path', () => {
    const ops = mkOps({ matchStates: { m1: { matchId: 'm1', status: 'called' } } });
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);
    expect(screen.getByTestId('meet-run-enter-score')).toBeInTheDocument();
  });
});

// ── MeetMatchPanel — undo start ───────────────────────────────────────────

describe('MeetMatchPanel — undo start', () => {
  it('restores the schedule position and walks the state back to scheduled', async () => {
    const ops = mkOps();
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);

    fireEvent.click(screen.getByTestId('meet-run-undo-start'));

    await waitFor(() => {
      expect(ops.undoStart).toHaveBeenCalledWith('m1');
      expect(ops.updateMatchStatus).toHaveBeenCalledWith('m1', 'scheduled', expect.anything());
    });
    // Presence of `actualStartTime: undefined` is what clears the stamp.
    const [, , data] = ops.updateMatchStatus.mock.calls[0];
    expect(Object.prototype.hasOwnProperty.call(data, 'actualStartTime')).toBe(true);
    expect(data.actualStartTime).toBeUndefined();
  });

  it('renders no undo-start for a match that has not started', () => {
    const ops = mkOps({ matchStates: { m1: { matchId: 'm1', status: 'called' } } });
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);
    expect(screen.queryByTestId('meet-run-undo-start')).toBeNull();
  });
});

// ── MeetMatchPanel — check-in ─────────────────────────────────────────────

describe('MeetMatchPanel — check-in', () => {
  const calledState = (confirmations?: Record<string, boolean>) => ({
    m1: { matchId: 'm1', status: 'called', playerConfirmations: confirmations } as MatchStateDTO,
  });

  it('a player pill toggles confirmPlayer', async () => {
    const ops = mkOps({ matchStates: calledState() });
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);

    fireEvent.click(screen.getByTestId('meet-run-checkin-p1'));
    await waitFor(() => expect(ops.confirmPlayer).toHaveBeenCalledWith('m1', 'p1', true));
  });

  it('"All in" confirms only the still-missing players', async () => {
    const ops = mkOps({ matchStates: calledState({ p1: true }) });
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);

    fireEvent.click(screen.getByTestId('meet-run-checkin-all'));
    await waitFor(() => expect(ops.confirmPlayer).toHaveBeenCalledWith('m1', 'p2', true));
    expect(ops.confirmPlayer).toHaveBeenCalledTimes(1);
  });

  it('no check-in affordance before the match is called', () => {
    const ops = mkOps({ matchStates: { m1: { matchId: 'm1', status: 'scheduled' } } });
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);
    expect(screen.queryByTestId('meet-run-checkin-p1')).toBeNull();
  });
});

// ── MeetMatchPanel — substitute / remove ──────────────────────────────────

describe('MeetMatchPanel — roster edits', () => {
  it('substitute picker lists only out-of-match players and calls substitutePlayer', () => {
    const ops = mkOps();
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);

    fireEvent.click(screen.getByTestId('meet-run-sub-p1'));
    // p1/p2 are in the match — not offered; p3 and p9 are.
    expect(screen.queryByRole('button', { name: 'Bob' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zoe' }));

    expect(ops.substitutePlayer).toHaveBeenCalledWith('m1', 'p1', 'p9');
  });

  it('remove arms on the first press and removes on the second', () => {
    const ops = mkOps();
    render(<MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} />);

    const btn = screen.getByTestId('meet-run-remove-p2');
    fireEvent.click(btn);
    expect(ops.removePlayer).not.toHaveBeenCalled();
    expect(btn).toHaveTextContent('× confirm');
    fireEvent.click(btn);
    expect(ops.removePlayer).toHaveBeenCalledWith('m1', 'p2');
  });
});

// ── MeetMatchPanel — impact ───────────────────────────────────────────────

describe('MeetMatchPanel — shared-player impact', () => {
  it('renders the impacted matches with the shared player and selects on click', () => {
    const ops = mkOps({
      analyzeImpact: () => ({
        matchId: 'm1',
        overrunSlots: 0,
        actualEndSlot: 2,
        scheduledEndSlot: 2,
        directlyImpacted: ['m2'],
        cascadeImpacted: [],
        suggestedAction: 'none',
      }),
    });
    const onSelectKey = vi.fn();
    render(
      <MeetMatchPanel match={m1()} ops={ops} onFinished={vi.fn()} onSelectKey={onSelectKey} />,
    );

    const impact = screen.getByTestId('meet-run-impact');
    expect(impact).toHaveTextContent('MS2');
    expect(impact).toHaveTextContent('Alice'); // the shared player
    fireEvent.click(screen.getByRole('button', { name: /MS2/ }));
    expect(onSelectKey).toHaveBeenCalledWith('meet:m2');
  });
});

// ── RunFinished ───────────────────────────────────────────────────────────

describe('RunFinished — undo-finish', () => {
  const doneMeet = mkRunMatch({
    key: 'meet:m1',
    id: 'm1',
    source: 'meet',
    status: 'done',
    court: 2,
    plannedSlot: 3,
  });
  const doneBracket = mkRunMatch({
    key: 'bracket:pu1',
    id: 'pu1',
    source: 'bracket',
    status: 'done',
  });

  it('renders nothing while no match is done', () => {
    const { container } = render(
      <RunFinished matches={[mkRunMatch({ key: 'meet:m9', id: 'm9', source: 'meet' })]} meetOps={mkOps()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the recorded score and undoes on the armed second press', async () => {
    const ops = mkOps({
      matchStates: {
        m1: { matchId: 'm1', status: 'finished', score: { sideA: 2, sideB: 0 } },
      },
    });
    render(<RunFinished matches={[doneMeet]} meetOps={ops} />);

    expect(screen.getByTestId('run-finished')).toHaveTextContent('2–0');

    const undo = screen.getByTestId('run-finished-undo-m1');
    fireEvent.click(undo);
    expect(ops.updateMatchStatus).not.toHaveBeenCalled(); // armed, not fired
    fireEvent.click(undo);
    await waitFor(() =>
      expect(ops.updateMatchStatus).toHaveBeenCalledWith('m1', 'started', expect.anything()),
    );
    // Key PRESENCE is the contract: `score: undefined` overwrites (clears)
    // the recorded result on the state route; an absent key would retain it.
    // (Deep equality ignores undefined-valued keys, so assert ownership.)
    const [, , data] = ops.updateMatchStatus.mock.calls[0];
    for (const k of ['actualEndTime', 'score', 'sets']) {
      expect(Object.prototype.hasOwnProperty.call(data, k), `clears ${k}`).toBe(true);
      expect(data[k]).toBeUndefined();
    }
  });

  it('bracket rows are read-only (result corrections live on the bracket surface)', () => {
    render(<RunFinished matches={[doneBracket]} meetOps={mkOps()} />);
    expect(screen.getByTestId('run-finished')).toBeInTheDocument();
    expect(screen.queryByTestId('run-finished-undo-pu1')).toBeNull();
  });
});

// ── RunSurface integration — the meet seams mount the C4 surfaces ─────────

describe('RunSurface — meet rail integration', () => {
  function mkBlock(
    overrides: Partial<OpsBlock> & Pick<OpsBlock, 'id' | 'source' | 'status'>,
  ): OpsBlock {
    return {
      key: `${overrides.source}:${overrides.id}`,
      label: overrides.id,
      span: 1,
      sideA: 'Alice',
      sideB: 'Bob',
      done: overrides.status === 'finished',
      started: overrides.status === 'started' || overrides.status === 'finished',
      ...overrides,
    };
  }

  const blocks: OpsBlock[] = [
    mkBlock({ id: 'm1', source: 'meet', status: 'started', court: 1, slot: 0 }),
    mkBlock({ id: 'm2', source: 'meet', status: 'finished', court: 2, slot: 1 }),
  ];

  function renderSurface(meetOps?: MeetRunOps) {
    return render(
      <RunSurface
        blocks={blocks}
        bracketData={null}
        onBracketData={vi.fn()}
        courtCount={2}
        currentSlot={0}
        planFinalized
        meetOps={meetOps}
      />,
    );
  }

  it('selecting a playing meet match mounts the meet rail and hides the static player list', () => {
    renderSurface(mkOps());

    fireEvent.click(screen.getByTestId('run-card-meet:m1'));
    expect(screen.getByTestId('run-meet-panel')).toBeInTheDocument();
    expect(screen.getByTestId('meet-run-enter-score')).toBeInTheDocument();
    // The interactive rows replace the inspector's static names.
    expect(screen.queryByTestId('run-inspector-players')).toBeNull();
    expect(screen.getByTestId('meet-run-players')).toBeInTheDocument();
  });

  it('without meetOps (bracket-only workspace) nothing meet-flavoured renders', () => {
    renderSurface(undefined);

    // Finished stays as a read-only record — but carries no undo without seams.
    expect(screen.queryByTestId('run-finished-undo-m2')).toBeNull();
    fireEvent.click(screen.getByTestId('run-card-meet:m1'));
    expect(screen.queryByTestId('run-meet-panel')).toBeNull();
    expect(screen.getByTestId('run-inspector-players')).toBeInTheDocument();
  });

  it('the Finished section renders the done match from the meetOps seam', () => {
    renderSurface(
      mkOps({
        matchStates: {
          m2: { matchId: 'm2', status: 'finished', score: { sideA: 2, sideB: 1 } },
        },
      }),
    );
    const finished = screen.getByTestId('run-finished');
    expect(finished).toHaveTextContent('m2');
    expect(finished).toHaveTextContent('2–1');
    expect(screen.getByTestId('run-finished-undo-m2')).toBeInTheDocument();
  });
});
