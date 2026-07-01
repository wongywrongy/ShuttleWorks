import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketLiveView } from '../BracketLiveView';
import { data } from './bracketDisplayData.test';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

describe('BracketLiveView', () => {
  it('renders on-court matches with court + sides', () => {
    render(<BracketLiveView data={data} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(/court 2/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing is on court', () => {
    const empty = { ...data, assignments: [] } as unknown as BracketTournamentDTO;
    render(<BracketLiveView data={empty} />);
    expect(screen.getByTestId('bracket-live-empty')).toBeInTheDocument();
  });
});
