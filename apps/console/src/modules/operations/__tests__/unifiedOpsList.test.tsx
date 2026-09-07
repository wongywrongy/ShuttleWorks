import { identityFixture } from './identityFixture';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UnifiedOpsList } from '../UnifiedOpsList';
import type { OpsBlock } from '../opsBlock';

function blk(p: Partial<OpsBlock> & Pick<OpsBlock, 'source' | 'id'>): OpsBlock {
  return {
    key: `${p.source}:${p.id}`,
    identity: identityFixture(p.id),
    span: 1,
    status: 'scheduled',
    sideA: 'A',
    sideB: 'B',
    playerIds: [],
    done: false,
    started: false,
    ...p,
  };
}

const BLOCKS: OpsBlock[] = [
  blk({ source: 'meet', id: 'm1', court: 1, slot: 0, status: 'scheduled' }),
  blk({ source: 'bracket', id: 'pu1', court: 2, slot: 1, status: 'started', started: true }),
  blk({ source: 'bracket', id: 'pu9', status: 'scheduled' }), // pending (no court)
  blk({ source: 'meet', id: 'm9', done: true, status: 'finished', court: 3, slot: 2 }),
];

describe('UnifiedOpsList', () => {
  it('sections rows into On court / Up next / Pending / Finished and tags each by source', () => {
    // V3-OC05.1: a started-and-court-assigned match (pu1) is "On court", not
    // "Up next" — the two headings must never overlap.
    render(<UnifiedOpsList blocks={BLOCKS} onAction={() => {}} />);
    expect(screen.getByText(/On court · 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Up next · 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending · 1/i)).toBeInTheDocument();
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

  it('removes the location column from a finished section when it never varies', () => {
    render(
      <UnifiedOpsList
        blocks={[
          blk({ source: 'bracket', id: 'done-1', done: true, status: 'finished' }),
          blk({ source: 'bracket', id: 'done-2', done: true, status: 'finished' }),
        ]}
      />,
    );
    expect(screen.queryByTestId('ops-row-location')).not.toBeInTheDocument();
  });

  // P6: the section band already names the state and section membership is
  // derived from the SAME predicates, so a per-row state word could only ever
  // repeat the heading above it.
  it('carries no per-row state word — the section band is the only place state is said', () => {
    render(
      <UnifiedOpsList
        blocks={[
          blk({ source: 'meet', id: 'playing', court: 1, slot: 0, status: 'started', started: true }),
          blk({ source: 'meet', id: 'scheduled', court: 2, slot: 1, status: 'scheduled' }),
        ]}
      />,
    );
    expect(screen.queryAllByTestId('ops-status-marker')).toHaveLength(0);
  });

  // P6: a slot index is storage, never operator copy — the location column
  // names the court in words and nothing else.
  it('names the court in words and never prints a slot index', () => {
    render(
      <UnifiedOpsList
        blocks={[blk({ source: 'meet', id: 'm1', court: 3, slot: 152, status: 'scheduled' })]}
      />,
    );
    const location = screen.getByTestId('ops-row-location');
    expect(location).toHaveTextContent('Court 3');
    expect(location).not.toHaveTextContent(/S152|C3/);
  });

  // V3-OC18.1: a filter over a category that never varies is a control with
  // nothing to control (X16) — it only earns its place once both engines
  // are actually present in the list.
  it('shows the match-type filter only when both engines are present', () => {
    const { unmount } = render(
      <UnifiedOpsList blocks={BLOCKS} searchable />,
    );
    expect(screen.getByText('Match type')).toBeInTheDocument();
    unmount();

    render(
      <UnifiedOpsList
        blocks={[blk({ source: 'meet', id: 'm1', court: 1, slot: 0, status: 'scheduled' })]}
        searchable
      />,
    );
    expect(screen.queryByText('Match type')).not.toBeInTheDocument();
  });
});
