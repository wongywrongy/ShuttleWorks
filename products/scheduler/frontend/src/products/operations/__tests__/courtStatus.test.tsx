import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { CourtStatusBoard } from '../CourtStatusBoard';
import { LiveStatusBar } from '../LiveStatusBar';
import type { OpsBlock } from '../opsBlock';

function ob(p: Partial<OpsBlock> & Pick<OpsBlock, 'source' | 'id'>): OpsBlock {
  return { key: `${p.source}:${p.id}`, label: p.id, span: 1, status: 'scheduled', sideA: 'Alice / Carol', sideB: 'Bob / Dan', done: false, started: false, ...p };
}

describe('CourtStatusBoard', () => {
  const blocks: OpsBlock[] = [
    ob({ source: 'meet', id: 'm1', court: 1, slot: 0, status: 'started', started: true }),
    ob({ source: 'meet', id: 'm2', court: 1, slot: 1 }), // on deck for court 1
    // court 2 has nothing -> free
  ];

  it('renders a card per court; shows the playing match on court 1 and Free on court 2', () => {
    render(
      <CourtStatusBoard blocks={blocks} courtCount={2} currentSlot={0} intervalMinutes={30} onAction={() => {}} onSelect={() => {}} />,
    );
    const c1 = document.querySelector('[data-court="1"]')!;
    const c2 = document.querySelector('[data-court="2"]')!;
    expect(within(c1 as HTMLElement).getByText(/Playing/)).toBeInTheDocument();
    expect(within(c1 as HTMLElement).getByText(/On deck/i)).toBeInTheDocument();
    expect(within(c2 as HTMLElement).getByText(/^Free$/)).toBeInTheDocument();
  });

  it('routes Finish for the playing meet match', () => {
    const onAction = vi.fn();
    render(
      <CourtStatusBoard blocks={blocks} courtCount={2} currentSlot={0} intervalMinutes={30} onAction={onAction} onSelect={() => {}} />,
    );
    const c1 = document.querySelector('[data-court="1"]') as HTMLElement;
    fireEvent.click(within(c1).getByRole('button', { name: 'Finish' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), { kind: 'finish' });
  });
});

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
