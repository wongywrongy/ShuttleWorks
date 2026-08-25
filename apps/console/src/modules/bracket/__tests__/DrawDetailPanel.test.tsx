import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DrawDetailPanel } from '../DrawDetailPanel';
import type { BracketEventDTO } from '../eventUpsertPayload';

const onClose = vi.fn();
const onCommitPicks = vi.fn().mockResolvedValue(undefined);

const ev: BracketEventDTO = {
  id: 'MS',
  discipline: 'MS',
  format: 'se',
  bracket_size: 4,
  participant_count: 1,
  rounds: [],
  status: 'draft',
  participants: [{ id: 'p-alex', name: 'Alex Tan', seed: 1 }],
} as BracketEventDTO;

const players = [
  // Alex came through the entries commit seam and holds a person key;
  // Ben was hand-added and holds none (R-DM-2(a)).
  { id: 'p-alex', name: 'Alex Tan', entryPlayerId: 'ep-alex' },
  { id: 'p-ben', name: 'Ben Carter' },
];

beforeEach(() => {
  onClose.mockReset();
  onCommitPicks.mockClear();
});

describe('DrawDetailPanel', () => {
  it('renders the draw identity header and config summary', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    const panel = screen.getByTestId('draw-detail-panel');
    expect(within(panel).getByText('MS')).toBeInTheDocument();
    expect(within(panel).getByText(/Single elimination/)).toBeInTheDocument();
    expect(within(panel).getByText('Bracket size')).toBeInTheDocument();
    expect(within(panel).getByText('4')).toBeInTheDocument();
  });

  it('hosts the participant picker and forwards commits', async () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    expect(screen.getByText(/Pick participants/i)).toBeInTheDocument();
    // Options are grouped by initial and sorted: Alex Tan, then Ben Carter.
    fireEvent.click(screen.getByRole('checkbox', { name: /Ben Carter/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save participants$/i }));
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'p-alex' }),
        expect.objectContaining({ id: 'p-ben' }),
      ]),
    );
  });

  // R-DM-2(a): the team row the doubles picker synthesizes is a
  // `bracket_participants` row like any other, so it has to carry the
  // nominating player's key — the same half `members[0]` names.
  it('carries the nominating player entryPlayerId onto a synthesized team', async () => {
    const md = { ...ev, id: 'MD', discipline: 'MD' } as BracketEventDTO;
    render(
      <DrawDetailPanel ev={md} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Alex Tan/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Ben Carter/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save pairs$/i }));
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    expect(onCommitPicks.mock.calls[0][0]).toEqual([
      {
        id: 'MD-T1',
        name: 'Alex Tan / Ben Carter',
        members: ['p-alex', 'p-ben'],
        entryPlayerId: 'ep-alex',
      },
    ]);
  });

  it('TODAY opens the SINGLES picker for a director-defined BD draw', () => {
    /* F-DM-13 characterization, before SP-DM-3 P5 Task 2 collapses the six
       doubles rules into one. `DrawDetailPanel.tsx:28` asks a closed
       `['MD','WD','XD']` list, so `BD` — doubles by the D-suffix convention
       the product documents as its rule (`MeetEventsSection.tsx:15`) and
       doubles everywhere in Meet — opens the singles picker here. Pinned
       through the COMPONENT, not through a literal: the sibling pin in
       `lib/__tests__/doubles.test.ts` asserts against its own copy of the
       closed list, so it stays green whatever this file says.
       EXPECTED TO FLIP IN TASK 2. */
    const bd = { ...ev, id: 'BD', discipline: 'BD' } as BracketEventDTO;
    render(
      <DrawDetailPanel ev={bd} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    expect(screen.getByRole('button', { name: /^Save participants$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save pairs$/i })).not.toBeInTheDocument();
  });

  // Commit REPLACES the event's participants. Opening the picker empty meant
  // ticking one name dropped everyone already entered.
  it('opens holding the participants already entered in the draw', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    expect(screen.getByRole('checkbox', { name: /Alex Tan/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ben Carter/ })).not.toBeChecked();
    expect(screen.getByText(/Pick participants \(1\)/i)).toBeInTheDocument();
  });

  it('TODAY drops every existing team when a doubles pair is committed', async () => {
    /* debt-log.md:96, characterized before SP-DM-3 P5 Task 6 fixes it.
       Commit REPLACES the event's participant list. The singles picker was
       taught to open holding what is already entered; the doubles half
       never was — `DrawDetailPanel.tsx:74` hands it a literal `[]` and
       `ParticipantPicker.tsx:92-98` does not forward `initialIds` at all.
       So an operator with four teams entered who forms one new pair saves
       ONE team. EXPECTED TO CHANGE IN TASK 6. */
    const roster = [
      ...players,
      { id: 'p-cara', name: 'Cara Diaz' },
      { id: 'p-dan', name: 'Dan Osei' },
      { id: 'p-eve', name: 'Eve Novak' },
      { id: 'p-fin', name: 'Fin Wallace' },
    ];
    const xd = {
      ...ev,
      id: 'XD',
      discipline: 'XD',
      participant_count: 2,
      participants: [
        { id: 'XD-T1', name: 'Cara Diaz / Dan Osei', members: ['p-cara', 'p-dan'] },
        { id: 'XD-T2', name: 'Eve Novak / Fin Wallace', members: ['p-eve', 'p-fin'] },
      ],
    } as unknown as BracketEventDTO;
    render(
      <DrawDetailPanel ev={xd} players={roster} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /Alex Tan/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Ben Carter/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save pairs$/i }));

    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toHaveLength(1);
    expect(picks[0].members).toEqual(['p-alex', 'p-ben']);
  });

  it('groups the roster by initial so a long list is navigable', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    const picker = screen.getByTestId('participant-picker');
    expect(within(picker).getByRole('group', { name: 'A' })).toBeInTheDocument();
    expect(within(picker).getByRole('group', { name: 'B' })).toBeInTheDocument();
  });

  it('closes via the panel close button', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Close detail/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes via the participant picker\'s own Cancel button', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
