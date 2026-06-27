import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OpsDetailRail } from '../OpsDetailRail';
import type { OpsBlock } from '../opsBlock';

const meetBlock: OpsBlock = {
  source: 'meet', id: 'm1', key: 'meet:m1', label: 'MS1', span: 1,
  court: 2, slot: 3, status: 'scheduled', sideA: 'Alice', sideB: 'Bob', done: false, started: false,
};

describe('OpsDetailRail', () => {
  it('prompts to select when nothing is chosen', () => {
    render(<OpsDetailRail block={null} data={null} onBracketChange={() => {}} onAction={() => {}} />);
    expect(screen.getByText(/Select a match to see details/i)).toBeInTheDocument();
  });

  it('shows the meet lifecycle rail and routes Start through onAction', () => {
    const onAction = vi.fn();
    render(<OpsDetailRail block={meetBlock} data={null} onBracketChange={() => {}} onAction={onAction} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(/Court C2 · slot 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start match/i }));
    expect(onAction).toHaveBeenCalledWith(meetBlock, { kind: 'start' });
    fireEvent.click(screen.getByRole('button', { name: /Call to court/i }));
    expect(onAction).toHaveBeenCalledWith(meetBlock, { kind: 'call' });
  });

  it('shows Finish for a started meet match', () => {
    const onAction = vi.fn();
    render(
      <OpsDetailRail
        block={{ ...meetBlock, status: 'started', started: true }}
        data={null}
        onBracketChange={() => {}}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Finish match/i }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), { kind: 'finish' });
  });
});
