import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RunSummaryBand } from '../run/RunSummaryBand';
import type { RunSummary } from '../runtime/runModel';

const FIXTURE: RunSummary = { done: 2, total: 5, playing: 1, courtsFree: 3, late: 1, disputedCourts: 0 };

describe('RunSummaryBand', () => {
  it('renders all four stat slots from props', () => {
    render(<RunSummaryBand summary={FIXTURE} />);

    const doneBand = screen.getByTestId('run-band-done');
    expect(within(doneBand).getByText('2 / 5')).toBeInTheDocument();
    expect(within(doneBand).getByText(/done/i)).toBeInTheDocument();

    const playingBand = screen.getByTestId('run-band-playing');
    expect(within(playingBand).getByText('1')).toBeInTheDocument();
    expect(within(playingBand).getByText(/playing/i)).toBeInTheDocument();

    const courtsBand = screen.getByTestId('run-band-courts-free');
    expect(within(courtsBand).getByText('3')).toBeInTheDocument();
    expect(within(courtsBand).getByText(/courts free/i)).toBeInTheDocument();

    const lateBand = screen.getByTestId('run-band-late');
    expect(within(lateBand).getByText('1')).toBeInTheDocument();
    expect(within(lateBand).getByText(/late/i)).toBeInTheDocument();
  });

  it('does not internally count — renders exactly what is passed', () => {
    const zero: RunSummary = { done: 0, total: 0, playing: 0, courtsFree: 0, late: 0, disputedCourts: 0 };
    render(<RunSummaryBand summary={zero} />);

    expect(screen.getByTestId('run-band-done')).toHaveTextContent('0 / 0');
    expect(screen.getByTestId('run-band-playing')).toHaveTextContent('0');
    expect(screen.getByTestId('run-band-courts-free')).toHaveTextContent('0');
    expect(screen.getByTestId('run-band-late')).toHaveTextContent('0');
  });

  it('never renders a disputed court as free or as extra playing matches (V3-OC19.2)', () => {
    // 6 courts, 2 disputed: the total must never read "8 playing" over 6
    // courts, and the 2 disputed courts must not appear in courtsFree either.
    const disputed: RunSummary = { done: 0, total: 8, playing: 4, courtsFree: 0, late: 0, disputedCourts: 2 };
    render(<RunSummaryBand summary={disputed} />);

    expect(screen.getByTestId('run-band-playing')).toHaveTextContent('4');
    expect(screen.getByTestId('run-band-courts-free')).toHaveTextContent('0');
    const disputedBand = screen.getByTestId('run-band-disputed');
    expect(within(disputedBand).getByText('2')).toBeInTheDocument();
    expect(within(disputedBand).getByText(/conflict/i)).toBeInTheDocument();
  });

  it('omits the conflicts tile entirely when there are no disputed courts', () => {
    render(<RunSummaryBand summary={FIXTURE} />);
    expect(screen.queryByTestId('run-band-disputed')).not.toBeInTheDocument();
  });

  it('applies a warning tint to the late stat when late > 0', () => {
    render(<RunSummaryBand summary={FIXTURE} />);
    const lateBand = screen.getByTestId('run-band-late');
    // The value span inside the late slot should carry the warning colour class.
    const valueEl = lateBand.querySelector('[data-late-value]');
    expect(valueEl).not.toBeNull();
    expect(valueEl!.className).toMatch(/status-warning|warning/);
  });
});
