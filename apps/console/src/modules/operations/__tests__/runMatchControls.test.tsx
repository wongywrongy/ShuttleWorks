import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { identityFixture } from './identityFixture';
import { RunAssignmentActions, RunResultActions } from '../run/RunMatchControls';
import type { RunMatch } from '../runtime/runModel';

vi.mock('../../../hooks/useCanEdit', () => ({ useCanEdit: () => true }));

function match(status: RunMatch['status'] = 'scheduled'): RunMatch {
  return {
    key: 'meet:m1', id: 'm1', source: 'meet', identity: identityFixture('MS1'),
    sideA: 'Alice', sideB: 'Bob', span: 1, status, late: false,
    timeliness: 'ontime', eligible: true, playerIds: [],
  };
}

describe('F-UNI-14 — Live Day supplies controls to the shared inspector', () => {
  it('routes lifecycle actions from the result facet', () => {
    const onAction = vi.fn();
    render(<RunResultActions match={match()} role="now" onAction={onAction} />);
    fireEvent.click(screen.getByTestId('run-act-call'));
    expect(onAction).toHaveBeenCalledWith('call');
  });

  it('guards the terminal record action with a two-press confirmation', () => {
    const onAction = vi.fn();
    render(<RunResultActions match={match('playing')} role="now" onAction={onAction} />);
    const record = screen.getByTestId('run-act-record');
    fireEvent.click(record);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(record);
    expect(onAction).toHaveBeenCalledWith('record');
  });

  it('routes queue assignment from the assignment facet', () => {
    const onAction = vi.fn();
    render(
      <RunAssignmentActions
        match={match()}
        role="queued"
        freeCourt={3}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByTestId('run-act-send'));
    expect(onAction).toHaveBeenCalledWith('assign', { court: 3 });
  });

  it('keeps postponement visually quieter than terminal result entry', () => {
    const onAction = vi.fn();
    const playing = match('playing');
    render(
      <>
        <RunResultActions match={playing} role="now" onAction={onAction} />
        <RunAssignmentActions match={playing} role="now" onAction={onAction} />
      </>,
    );
    expect(screen.getByTestId('run-act-record').className).toMatch(/bg-accent/);
    expect(screen.getByTestId('run-act-postpone').className).not.toMatch(/bg-accent/);
  });
});
