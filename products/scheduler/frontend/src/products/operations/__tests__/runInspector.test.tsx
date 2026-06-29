import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunInspector } from '../run/RunInspector';
import type { RunMatch } from '../runtime/runModel';

function mkMatch(p: Partial<RunMatch> & Pick<RunMatch, 'key' | 'id' | 'source' | 'label'>): RunMatch {
  return {
    sideA: 'Team A',
    sideB: 'Team B',
    span: 1,
    status: 'scheduled',
    late: false,
    eligible: true,
    ...p,
  };
}

// ── empty state ───────────────────────────────────────────────────────────

describe('RunInspector — empty state', () => {
  it('null match → invitation text + run-inspector-empty', () => {
    render(<RunInspector match={null} role={null} onAction={vi.fn()} />);
    expect(screen.getByTestId('run-inspector-empty')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Select a match to call it to a court, start play, or record the result.',
      ),
    ).toBeInTheDocument();
  });

  it('role===null with a match → same invitation', () => {
    const m = mkMatch({ key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1' });
    render(<RunInspector match={m} role={null} onAction={vi.fn()} />);
    expect(screen.getByTestId('run-inspector-empty')).toBeInTheDocument();
  });
});

// ── role: now ─────────────────────────────────────────────────────────────

describe('RunInspector — role: now', () => {
  it('scheduled → only Call; clicking fires onAction("call")', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'scheduled',
    });
    render(<RunInspector match={m} role="now" onAction={onAction} />);

    expect(screen.getByTestId('run-act-call')).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-start')).toBeNull();
    expect(screen.queryByTestId('run-act-record')).toBeNull();
    expect(screen.queryByTestId('run-act-postpone')).toBeNull();
    expect(screen.queryByTestId('run-act-win-a')).toBeNull();
    expect(screen.queryByTestId('run-act-win-b')).toBeNull();

    fireEvent.click(screen.getByTestId('run-act-call'));
    expect(onAction).toHaveBeenCalledWith('call');
  });

  it('called → Start + Postpone; no Call, no Record', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'called',
    });
    render(<RunInspector match={m} role="now" onAction={onAction} />);

    expect(screen.getByTestId('run-act-start')).toBeInTheDocument();
    expect(screen.getByTestId('run-act-postpone')).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-call')).toBeNull();
    expect(screen.queryByTestId('run-act-record')).toBeNull();
    expect(screen.queryByTestId('run-act-win-a')).toBeNull();
    expect(screen.queryByTestId('run-act-win-b')).toBeNull();

    fireEvent.click(screen.getByTestId('run-act-start'));
    expect(onAction).toHaveBeenCalledWith('start');
  });

  it('playing meet → Record result + Postpone; clicking record fires onAction("record")', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={onAction} />);

    expect(screen.getByTestId('run-act-record')).toBeInTheDocument();
    expect(screen.getByTestId('run-act-postpone')).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-call')).toBeNull();
    expect(screen.queryByTestId('run-act-start')).toBeNull();
    expect(screen.queryByTestId('run-act-win-a')).toBeNull();
    expect(screen.queryByTestId('run-act-win-b')).toBeNull();

    fireEvent.click(screen.getByTestId('run-act-record'));
    expect(onAction).toHaveBeenCalledWith('record');
  });

  it('playing bracket → A wins / B wins; clicking fires onAction("record",{winnerSide})', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'bracket:pu1', id: 'pu1', source: 'bracket', label: 'QF1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={onAction} />);

    expect(screen.getByTestId('run-act-win-a')).toBeInTheDocument();
    expect(screen.getByTestId('run-act-win-b')).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-record')).toBeNull();

    fireEvent.click(screen.getByTestId('run-act-win-a'));
    expect(onAction).toHaveBeenCalledWith('record', { winnerSide: 'A' });

    onAction.mockClear();
    fireEvent.click(screen.getByTestId('run-act-win-b'));
    expect(onAction).toHaveBeenCalledWith('record', { winnerSide: 'B' });
  });

  it('playing bracket → Postpone also rendered', () => {
    const m = mkMatch({
      key: 'bracket:pu1', id: 'pu1', source: 'bracket', label: 'QF1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={vi.fn()} />);
    expect(screen.getByTestId('run-act-postpone')).toBeInTheDocument();
  });
});

// ── role: next-later ──────────────────────────────────────────────────────

describe('RunInspector — role: next-later', () => {
  it('shows the queued-behind note and NO action buttons', () => {
    const m = mkMatch({
      key: 'meet:m2', id: 'm2', source: 'meet', label: 'MS2', status: 'scheduled',
    });
    render(
      <RunInspector
        match={m}
        role="next-later"
        nowRef={{ code: 'MS1', court: 1 }}
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'Queued behind MS1 on C1 — advances when the court clears.',
      ),
    ).toBeInTheDocument();

    expect(screen.queryByTestId('run-act-call')).toBeNull();
    expect(screen.queryByTestId('run-act-start')).toBeNull();
    expect(screen.queryByTestId('run-act-record')).toBeNull();
    expect(screen.queryByTestId('run-act-postpone')).toBeNull();
    expect(screen.queryByTestId('run-act-send')).toBeNull();
    expect(screen.queryByTestId('run-act-win-a')).toBeNull();
    expect(screen.queryByTestId('run-act-win-b')).toBeNull();
  });
});

// ── role: queued ──────────────────────────────────────────────────────────

describe('RunInspector — role: queued', () => {
  it('freeCourt → Send to C{n} fires onAction("assign",{court:n})', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'meet:m3', id: 'm3', source: 'meet', label: 'MS3', status: 'scheduled',
    });
    render(<RunInspector match={m} role="queued" freeCourt={3} onAction={onAction} />);

    const sendBtn = screen.getByTestId('run-act-send');
    expect(sendBtn).toBeInTheDocument();
    expect(sendBtn.textContent).toMatch(/Send to C3/);

    fireEvent.click(sendBtn);
    expect(onAction).toHaveBeenCalledWith('assign', { court: 3 });
  });

  it('no freeCourt → "no court free" note, no send button', () => {
    const m = mkMatch({
      key: 'meet:m3', id: 'm3', source: 'meet', label: 'MS3', status: 'scheduled',
    });
    render(<RunInspector match={m} role="queued" onAction={vi.fn()} />);

    expect(
      screen.getByText('No court is free — waits for one to clear.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-send')).toBeNull();
  });
});
