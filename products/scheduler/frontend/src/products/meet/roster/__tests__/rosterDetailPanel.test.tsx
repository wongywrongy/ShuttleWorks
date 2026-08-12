/**
 * The roster detail pane after the console-IA pass (§1, §2, defects D8/D16).
 *
 * What this holds:
 *  - Unassigning a player from a position lives HERE, armed, and NOT in the
 *    grid cell (finding 1.1: 24 immediate `×` targets, one per seat, ~4px
 *    from the name button whose click means "just show me this").
 *  - The body is labelled sections in ONE order — Identity, Availability,
 *    Events, Notes — instead of ten controls under a flat `flex-col gap-3`.
 *  - A doubles position shows ONE occupant at a time behind a seat switcher,
 *    instead of the whole seven-block form twice, stacked, unlabelled.
 *  - Every configured event is offerable, including one no fixed
 *    MS/WS/MD/WD/XD category covers (D8: a "Not entered" discipline used to
 *    expand to an empty body with no control to enter the player).
 *  - Typing a note does not invalidate the schedule (D16).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DetailDrawer } from '../PlayerDetailPanel';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import type {
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../../../api/dto';

const GROUPS = [
  { id: 'S1', name: 'Alpha High' },
  { id: 'S2', name: 'Beta Prep' },
] as RosterGroupDTO[];

const mkPlayer = (id: string, name: string, ranks: string[] = []): PlayerDTO =>
  ({ id, name, groupId: 'S1', ranks, availability: [] }) as PlayerDTO;

const PLAYERS: PlayerDTO[] = [
  mkPlayer('p1', 'Aiko', ['MD1']),
  mkPlayer('p2', 'Ben', ['MD1']),
];

// MS is configured but nobody has entered it, and BS is an operator-defined
// event no fixed discipline table knows about.
const CONFIG = {
  rankCounts: { MD: 2, MS: 2, BS: 2 },
  dayStart: '09:00',
  dayEnd: '17:00',
  defaultRestMinutes: 30,
} as unknown as TournamentConfig;

const player = (id: string) =>
  useTournamentStore.getState().players.find((p) => p.id === id);

beforeEach(() => {
  useTournamentStore.setState({
    config: CONFIG,
    groups: GROUPS,
    players: PLAYERS.map((p) => ({ ...p, ranks: [...(p.ranks ?? [])] })),
    scheduleIsStale: false,
  });
  useUiStore.setState({ activeTournamentRole: 'owner' });
});

const renderPosition = (occupants = ['p1', 'p2']) =>
  render(
    <DetailDrawer
      eyebrow="Position"
      title="MD1"
      mono
      rank="MD1"
      occupants={
        useTournamentStore
          .getState()
          .players.filter((p) => occupants.includes(p.id)) as PlayerDTO[]
      }
      groups={GROUPS}
      onClose={() => {}}
    />,
  );

describe('roster detail pane — grammar and order', () => {
  it('groups the form into the canonical four sections, in order', () => {
    renderPosition(['p1']);
    const eyebrows = screen
      .getAllByText(/^(IDENTITY|AVAILABILITY|EVENTS|NOTES)$/)
      .map((el) => el.textContent);
    expect(eyebrows).toEqual(['IDENTITY', 'AVAILABILITY', 'EVENTS', 'NOTES']);
  });

  it('shows one occupant at a time behind a seat switcher on a doubles position', () => {
    renderPosition();
    const switcher = screen.getByTestId('seat-switcher');
    expect(within(switcher).getByTestId('seat-tab-0')).toHaveTextContent('Aiko');
    expect(within(switcher).getByTestId('seat-tab-1')).toHaveTextContent('Ben');
    // Exactly ONE form is mounted, not both stacked.
    expect(screen.getAllByLabelText('Notes')).toHaveLength(1);
    expect(screen.getByLabelText(/Unassign Aiko/)).toBeInTheDocument();

    fireEvent.click(within(switcher).getByTestId('seat-tab-1'));
    expect(screen.getByLabelText(/Unassign Ben/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Unassign Aiko/)).not.toBeInTheDocument();
  });

  it('offers no seat switcher for a single occupant', () => {
    renderPosition(['p1']);
    expect(screen.queryByTestId('seat-switcher')).not.toBeInTheDocument();
  });
});

describe('roster detail pane — unassign (console-IA finding 1.1)', () => {
  it('arms on the first press and does NOT unassign', () => {
    renderPosition(['p1']);
    fireEvent.click(screen.getByTestId('unassign-p1'));
    expect(player('p1')?.ranks).toEqual(['MD1']);
    expect(screen.getByLabelText(/Confirm unassign Aiko from MD1/)).toBeInTheDocument();
  });

  it('unassigns from THIS rank on the confirming second press', () => {
    renderPosition(['p1']);
    fireEvent.click(screen.getByTestId('unassign-p1'));
    fireEvent.click(screen.getByTestId('unassign-p1'));
    expect(player('p1')?.ranks).toEqual([]);
    // The other occupant of the position is untouched.
    expect(player('p2')?.ranks).toEqual(['MD1']);
  });

  it('offers no unassign when a POOL player opened the pane (no position)', () => {
    render(
      <DetailDrawer
        eyebrow="Player"
        title="Aiko"
        occupants={[player('p1')!]}
        groups={GROUPS}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('unassign-p1')).not.toBeInTheDocument();
  });
});

describe('roster detail pane — events (defect D8)', () => {
  it('offers every configured event, including one no discipline table covers', () => {
    renderPosition(['p1']);
    const picker = screen.getByTestId('player-events-picker');
    // Grouped by the RAW event prefix, so an operator-defined code has a home.
    expect(within(picker).getByRole('group', { name: 'BS' })).toBeInTheDocument();
    // MS is configured and nobody has entered it — the control to enter this
    // player is present, rather than an empty body under a "Not entered" label.
    expect(within(picker).getByRole('checkbox', { name: 'MS1' })).toBeEnabled();
  });

  it('enters and withdraws the player through the roster invariant', () => {
    renderPosition(['p1']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'BS2' }));
    expect(player('p1')?.ranks).toEqual(['MD1', 'BS2']);
    // MD1's option names its other holder, which is the context the old flat
    // chip grid could only put in a `title`.
    fireEvent.click(screen.getByRole('checkbox', { name: 'MD1 Ben' }));
    expect(player('p1')?.ranks).toEqual(['BS2']);
  });
});

describe('roster detail pane — staleness (defect D16)', () => {
  it('does not invalidate the schedule when a note is typed', () => {
    renderPosition(['p1']);
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'taped ankle' },
    });
    expect(player('p1')?.notes).toBe('taped ankle');
    expect(useTournamentStore.getState().scheduleIsStale).toBe(false);
  });

  it('DOES invalidate it when a field the solver reads changes', () => {
    renderPosition(['p1']);
    fireEvent.change(screen.getByLabelText('Min rest'), {
      target: { value: '45' },
    });
    expect(useTournamentStore.getState().scheduleIsStale).toBe(true);
  });
});
