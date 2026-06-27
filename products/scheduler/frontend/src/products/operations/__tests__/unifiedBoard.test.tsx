import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedCourtBoard } from '../UnifiedCourtBoard';
import type { OperationalMatch } from '../../../lib/operations/operationalMatch';

// The board is the court×time grid the operator runs the day from. It must
// keep rendering when meet + bracket are combined (the F4 regression was that
// the board disappeared, leaving only a flat list).

const ASSIGNED: OperationalMatch[] = [
  { id: 'm1', source: 'meet', court: 1, courtLabel: 'C1', slot: 0, span: 1, sideA: 'Alice', sideB: 'Bob', status: 'scheduled' },
  { id: 'pu1', source: 'bracket', court: 2, courtLabel: 'C2', slot: 1, span: 1, sideA: 'Cara', sideB: 'Dan', status: 'started' },
];

describe('UnifiedCourtBoard', () => {
  it('renders the court×time board with one block per assigned match, tagged by source', () => {
    render(<UnifiedCourtBoard rows={ASSIGNED} />);
    expect(screen.getByTestId('unified-board')).toBeInTheDocument();
    const meetBlock = document.querySelector('[data-board-block="meet-m1"]');
    const bracketBlock = document.querySelector('[data-board-block="bracket-pu1"]');
    // both engines present on one board, each tagged by source
    expect(meetBlock?.getAttribute('data-source')).toBe('meet');
    expect(bracketBlock?.getAttribute('data-source')).toBe('bracket');
  });

  it('renders nothing when no match is assigned to a court (only a waiting queue exists)', () => {
    const waiting: OperationalMatch[] = [
      { id: 'm9', source: 'meet', sideA: 'X', sideB: 'Y', status: 'scheduled' },
      { id: 'pu9', source: 'bracket', sideA: 'E', sideB: 'F', status: 'scheduled' },
    ];
    const { container } = render(<UnifiedCourtBoard rows={waiting} />);
    expect(container).toBeEmptyDOMElement();
  });
});
