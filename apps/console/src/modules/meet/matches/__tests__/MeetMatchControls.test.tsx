/**
 * Meet-owned supplements inside the shared match detail component.
 *
 * F-UNI-11/F-UNI-17/F-UNI-18: the shared component owns identity, status,
 * facets and result facts. Meet supplies only its existing event editor and
 * interactive player controls through slots.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MatchInspector, type MatchInspectorModel, type MatchListStatus, type SetPair } from '../../../../components/control-plane';
import type {
  MatchDTO,
  MatchStateDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../../../api/dto';
import { meetMatchIdentityFromStored } from '../../../../platform/domain/matchIdentity';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import { MeetMatchControls } from '../MeetMatchControls';

const GROUPS = [
  { id: 'S1', name: 'Alpha High' },
  { id: 'S2', name: 'Beta Prep' },
] as RosterGroupDTO[];

const mkPlayer = (
  id: string,
  name: string,
  groupId: string,
  ranks: string[] = [],
): PlayerDTO => ({ id, name, groupId, ranks, availability: [] }) as PlayerDTO;

const PLAYERS: PlayerDTO[] = [
  mkPlayer('a1', 'Aiko', 'S1', ['MS1']),
  mkPlayer('a2', 'Ben', 'S1'),
  mkPlayer('b1', 'Eva', 'S2', ['MS1']),
];

const MATCH: MatchDTO = {
  id: 'm1',
  sideA: ['a1'],
  sideB: ['b1'],
  matchType: 'dual',
  eventRank: 'MS1',
  durationSlots: 1,
};

const CONFIG = {
  rankCounts: { MS: 2, WD: 1 },
  dayStart: '09:00',
  dayEnd: '17:00',
  defaultRestMinutes: 30,
} as unknown as TournamentConfig;

const playerById = (id: string) =>
  useTournamentStore.getState().players.find((player) => player.id === id);
const matchById = (id: string) =>
  useTournamentStore.getState().matches.find((match) => match.id === id);

beforeEach(() => {
  useTournamentStore.setState({
    config: CONFIG,
    groups: GROUPS,
    players: PLAYERS.map((player) => ({
      ...player,
      ranks: [...(player.ranks ?? [])],
    })),
    matches: [{ ...MATCH }],
  });
  useUiStore.setState({ activeTournamentRole: 'owner' });
  useMatchStateStore.setState({ matchStates: {} });
});

function renderSurface(
  match: MatchDTO = MATCH,
  status: MatchListStatus = 'pending',
) {
  const store = useTournamentStore.getState();
  const state = useMatchStateStore.getState().matchStates[match.id];
  const resultSets: SetPair[] =
    status !== 'done'
      ? []
      : state?.sets?.length
        ? state.sets
        : state?.score
          ? [state.score]
          : [];
  const identity = meetMatchIdentityFromStored({
    event_rank: match.eventRank,
    sequence: match.matchNumber,
    configured_event_codes: Object.keys(store.config?.rankCounts ?? {}),
  });
  const model: MatchInspectorModel = {
    key: `meet:${match.id}`,
    id: match.id,
    identity,
    status: status === 'done' ? 'Done' : status === 'ready' ? 'Ready' : 'Pending',
    sideA: 'Aiko',
    sideB: 'Eva',
    result: resultSets.length > 0 ? { sets: resultSets } : null,
  };
  const control = (slot: 'players' | 'summary' | 'result') => (
    <MeetMatchControls
      slot={slot}
      match={match}
      status={status}
      eventCode={identity.event_code}
      resultSets={resultSets}
      players={store.players}
      groups={store.groups}
      rankCounts={store.config?.rankCounts}
      onUpdateMatch={store.updateMatch}
    />
  );

  return render(
    <MatchInspector
      match={model}
      defaultFacet="summary"
      onClose={() => {}}
      supplements={{
        players: control('players'),
        summary: control('summary'),
        result: control('result'),
      }}
    />,
  );
}

describe('<MeetMatchControls /> in the shared match detail surface', () => {
  it('uses the shared identity header, default Summary facet and plain status line', () => {
    renderSurface();
    const surface = screen.getByTestId('match-inspector');
    const header = within(surface).getByText('Match').closest('header')!;
    expect(within(header).getByText('MS1')).toBeInTheDocument();
    expect(screen.getByTestId('match-inspector-facet-summary')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('match-inspector-status')).toHaveTextContent('Pending');
    expect(screen.queryByText('STATUS')).not.toBeInTheDocument();
  });

  it('renders each side as expandable player cards with school identity', () => {
    renderSurface();
    const cardA = screen.getByTestId('match-player-card-a1');
    expect(cardA).toHaveTextContent('Aiko');
    expect(cardA).toHaveTextContent('AH');
    expect(within(cardA).getByTitle('Alpha High')).toBeInTheDocument();
    const cardB = screen.getByTestId('match-player-card-b1');
    expect(cardB).toHaveTextContent('Eva');
    expect(cardB).toHaveTextContent('BP');
  });

  it('keeps empty and stale roster references visible', () => {
    renderSurface({ ...MATCH, sideA: ['ghost'], sideB: [] });
    expect(screen.getByText('Not on roster')).toBeInTheDocument();
    const placeholder = screen.getByText('No players assigned');
    expect(placeholder.className).toContain('border-dashed');
  });

  it('expands player cards to the canonical availability and event fields', () => {
    renderSurface();
    fireEvent.click(screen.getByTestId('match-player-card-a1'));
    expect(screen.getByTestId('availability-control')).toBeInTheDocument();
    expect(screen.getByTestId('player-events-picker')).toBeInTheDocument();
  });

  it('writes player availability and event edits to the canonical roster record', () => {
    renderSurface();
    fireEvent.click(screen.getByTestId('match-player-card-a1'));
    fireEvent.click(screen.getByTestId('availability-add-period'));
    expect(playerById('a1')?.availability).toEqual([
      { start: '10:00', end: '17:00' },
    ]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'MS2' }));
    expect(playerById('a1')?.ranks).toEqual(['MS1', 'MS2']);
  });

  it('edits the match event through the grouped picker', () => {
    renderSurface();
    fireEvent.click(screen.getByTestId('match-event-trigger'));
    const picker = screen.getByTestId('event-picker');
    expect(within(picker).getByRole('group', { name: 'MS' })).toBeInTheDocument();
    expect(within(picker).getByRole('group', { name: 'WD' })).toBeInTheDocument();
    expect(within(picker).getByRole('radio', { name: /^MS1 2 entered$/ })).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole('radio', { name: /^WD1/ }));
    expect(matchById('m1')?.eventRank).toBe('WD1');
    expect(screen.queryByTestId('event-picker')).not.toBeInTheDocument();
  });

  it('adds and removes players while respecting singles capacity', () => {
    renderSurface({ ...MATCH, sideB: [] });
    fireEvent.click(screen.getByTestId('side-add-side-b'));
    fireEvent.click(screen.getByTestId('match-player-option-a2'));
    expect(matchById('m1')?.sideB).toEqual(['a2']);

    fireEvent.click(screen.getByTestId('side-remove-a1'));
    expect(matchById('m1')?.sideA).toEqual(['a1']);
    fireEvent.click(screen.getByTestId('side-remove-a1'));
    expect(matchById('m1')?.sideA).toEqual([]);
  });

  it('has no per-match Slots field', () => {
    renderSurface();
    expect(screen.queryByLabelText('Slots')).not.toBeInTheDocument();
    expect(screen.queryByText('Slots')).not.toBeInTheDocument();
  });
});

describe('<MeetMatchControls /> finished state', () => {
  const finishState = (sets: SetPair[]) =>
    useMatchStateStore.setState({
      matchStates: {
        m1: { matchId: 'm1', status: 'finished', sets } as MatchStateDTO,
      },
    });

  it('removes every roster mutation affordance from a finished match', () => {
    finishState([
      { sideA: 21, sideB: 15 },
      { sideA: 21, sideB: 18 },
    ]);
    renderSurface(MATCH, 'done');
    expect(screen.getByTestId('match-finished-players')).toBeInTheDocument();
    expect(screen.queryByTestId('side-add-side-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('side-add-side-b')).not.toBeInTheDocument();
    expect(screen.queryByTestId('side-remove-a1')).not.toBeInTheDocument();
  });

  it('renders stored sets in the shared Result facet with Meet player rows as a supplement', () => {
    finishState([{ sideA: 21, sideB: 15 }]);
    renderSurface(MATCH, 'done');
    fireEvent.click(screen.getByTestId('match-inspector-facet-result'));
    expect(screen.getByTestId('match-inspector-panel-result')).toHaveTextContent('21–15');
    expect(screen.getByTestId('match-result-card')).toBeInTheDocument();
    const card = screen.getByTestId('match-player-card-a1');
    fireEvent.click(card);
    expect(screen.getByTestId('availability-control')).toBeInTheDocument();
  });

  it('shows the honest empty result state when no score was recorded', () => {
    renderSurface(MATCH, 'done');
    fireEvent.click(screen.getByTestId('match-inspector-facet-result'));
    expect(screen.getByText('No result recorded.')).toBeInTheDocument();
    expect(screen.getByTestId('match-result-card')).toBeInTheDocument();
  });
});
