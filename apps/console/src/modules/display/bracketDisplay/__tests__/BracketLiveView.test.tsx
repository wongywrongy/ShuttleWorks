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
    // The card IS the court number (match-card §4.4): largest element,
    // no "Court 2" label competing with it.
    expect(screen.getByTestId('bracket-court-number-2').textContent).toBe('2');
  });

  it('renders no placeholder prose on a court with nothing to show', () => {
    render(<BracketLiveView data={data} />);
    expect(screen.queryByText(/no next match assigned/i)).toBeNull();
    expect(screen.queryByText(/court assignment unavailable/i)).toBeNull();
    expect(screen.queryByText(/court free/i)).toBeNull();
  });

  it('omits the Next preview unless the board setting is on', () => {
    const off = render(<BracketLiveView data={data} />);
    expect(off.container.textContent).not.toMatch(/Next/);
    off.unmount();
    // With it on, an unresolved side still omits the preview rather than
    // putting "To be decided" or a feeder reference on the wall.
    const on = render(<BracketLiveView data={data} showNext />);
    expect(on.container.textContent).not.toMatch(/To be decided|Winner of/);
  });

  it('shows an empty state when nothing is on court', () => {
    const empty = { ...data, assignments: [] } as unknown as BracketTournamentDTO;
    render(<BracketLiveView data={empty} />);
    expect(screen.getByTestId('bracket-live-empty')).toBeInTheDocument();
  });
});
