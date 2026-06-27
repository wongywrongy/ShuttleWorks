import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveStatusBar } from '../LiveStatusBar';
import type { OpsBlock } from '../opsBlock';

function ob(p: Partial<OpsBlock> & Pick<OpsBlock, 'source' | 'id'>): OpsBlock {
  return { key: `${p.source}:${p.id}`, label: p.id, span: 1, status: 'scheduled', sideA: 'Alice / Carol', sideB: 'Bob / Dan', done: false, started: false, ...p };
}

describe('LiveStatusBar', () => {
  it('counts completed / playing / free courts', () => {
    const blocks: OpsBlock[] = [
      ob({ source: 'meet', id: 'a', court: 1, status: 'started', started: true }),
      ob({ source: 'bracket', id: 'b', court: 2, status: 'finished', done: true }),
      ob({ source: 'meet', id: 'c', court: 3 }),
    ];
    render(<LiveStatusBar blocks={blocks} courtCount={4} />);
    expect(screen.getByText('1/3')).toBeInTheDocument(); // completed done/total
    expect(screen.getByText('1')).toBeInTheDocument(); // playing now
    expect(screen.getByText('3/4')).toBeInTheDocument(); // courts free (4 - 1 busy)
  });
});
