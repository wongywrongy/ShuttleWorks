import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UnifiedOpsList } from '../UnifiedOpsList';
import type { OpsBlock } from '../opsBlock';

function blk(p: Partial<OpsBlock> & Pick<OpsBlock, 'source' | 'id'>): OpsBlock {
  return {
    key: `${p.source}:${p.id}`,
    label: p.id,
    span: 1,
    status: 'scheduled',
    sideA: 'A',
    sideB: 'B',
    done: false,
    started: false,
    ...p,
  };
}

const BLOCKS: OpsBlock[] = [
  blk({ source: 'meet', id: 'm1', court: 1, slot: 0, status: 'scheduled' }),
  blk({ source: 'bracket', id: 'pu1', court: 2, slot: 1, status: 'started', started: true }),
  blk({ source: 'bracket', id: 'pu9', status: 'scheduled' }), // waiting (no court)
  blk({ source: 'meet', id: 'm9', done: true, status: 'finished', court: 3, slot: 2 }),
];

describe('UnifiedOpsList', () => {
  it('sections rows into Up next / Waiting / Finished and tags each by source', () => {
    render(<UnifiedOpsList blocks={BLOCKS} onAction={() => {}} />);
    expect(screen.getByText(/Up next · 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting · 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Finished · 1/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('ops-row')).toHaveLength(4);
  });

  it('routes a meet Start and a bracket winner with the right source + action', () => {
    const onAction = vi.fn();
    render(<UnifiedOpsList blocks={BLOCKS} onAction={onAction} />);
    const meetRow = screen.getByText('m1').closest('li')!;
    fireEvent.click(within(meetRow).getByRole('button', { name: 'Start' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ source: 'meet', id: 'm1' }), { kind: 'start' });

    const brkRow = screen.getByText('pu1').closest('li')!;
    fireEvent.click(within(brkRow).getByRole('button', { name: /A wins/i }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ source: 'bracket', id: 'pu1' }), { kind: 'recordWinner', winnerSide: 'A' });
  });

  it('omits action buttons when no handler is passed (read-only Courts overview)', () => {
    render(<UnifiedOpsList blocks={BLOCKS} />);
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });
});
