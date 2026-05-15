import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BracketRosterTab } from '../../features/bracket/BracketRosterTab';
import { useTournamentStore } from '../../store/tournamentStore';

beforeEach(() => {
  useTournamentStore.setState({
    bracketPlayers: [
      { id: 'p-alex-tan', name: 'Alex Tan' },
      { id: 'p-ben-carter', name: 'Ben Carter', notes: 'lefty' },
    ],
  });
});

describe('BracketRosterTab', () => {
  it('renders the player count and list of player names', () => {
    render(<BracketRosterTab />);
    expect(screen.getByText(/PLAYERS \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Alex Tan')).toBeInTheDocument();
    expect(screen.getByText('Ben Carter')).toBeInTheDocument();
  });

  it('adds a new player via the + Add player button', () => {
    render(<BracketRosterTab />);
    fireEvent.click(screen.getByRole('button', { name: /Add player/i }));
    const input = screen.getByPlaceholderText(/New player name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Cole Park' } });
    fireEvent.blur(input);
    const players = useTournamentStore.getState().bracketPlayers;
    expect(players.find((p) => p.name === 'Cole Park')).toBeDefined();
  });

  it('deletes a player and updates the count', () => {
    render(<BracketRosterTab />);
    const delButtons = screen.getAllByRole('button', { name: /Delete/i });
    fireEvent.click(delButtons[0]);
    const players = useTournamentStore.getState().bracketPlayers;
    expect(players).toHaveLength(1);
  });
});
