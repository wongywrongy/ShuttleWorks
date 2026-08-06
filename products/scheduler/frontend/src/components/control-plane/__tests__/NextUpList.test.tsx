import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextUpList } from '../NextUpList';
import type { NextMatchDTO } from '../../../api/dto';

const m = (over: Partial<NextMatchDTO>): NextMatchDTO => ({
  code: 'MS1',
  timeLabel: '09:30',
  courtLabel: 'Court 1',
  status: 'scheduled',
  ...over,
});

describe('NextUpList', () => {
  it('renders each upcoming match with its code + time · court', () => {
    render(<NextUpList items={[m({}), m({ code: 'WD2', courtLabel: 'Court 2' })]} />);
    expect(screen.getByText('MS1')).toBeInTheDocument();
    expect(screen.getByText(/09:30 · Court 1/)).toBeInTheDocument();
    expect(screen.getByText('WD2')).toBeInTheDocument();
    expect(screen.getByText(/09:30 · Court 2/)).toBeInTheDocument();
  });

  it('renders nothing when the list is empty', () => {
    const { container } = render(<NextUpList items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('omits a missing time or court without a dangling separator', () => {
    render(<NextUpList items={[m({ code: 'WS1', timeLabel: null })]} />);
    const meta = screen.getByText('Court 2'.replace('2', '1')); // "Court 1"
    expect(meta).toBeInTheDocument();
    expect(meta.textContent).not.toContain('·');
  });
});
