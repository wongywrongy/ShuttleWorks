import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

  // Recording is TERMINAL — `runMachine`'s `done` state has no edge out and
  // Meet has no reopen action — while Postpone beside it is legal from both
  // `called` and `playing` and undoes itself. They used to be the same neutral
  // button, one click each. The terminal one now arms first (`useConfirmClick`,
  // the canon guard; `window.confirm` is banned) and carries the accent weight
  // the reversible one does not.
  it('playing meet → Record ARMS on the first press and commits on the second', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={onAction} />);

    const record = screen.getByTestId('run-act-record');
    expect(screen.getByTestId('run-act-postpone')).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-call')).toBeNull();
    expect(screen.queryByTestId('run-act-start')).toBeNull();

    // First press: no write. The label names the consequence instead.
    fireEvent.click(record);
    expect(onAction).not.toHaveBeenCalled();
    expect(record.textContent).toMatch(/again/i);

    fireEvent.click(record);
    expect(onAction).toHaveBeenCalledWith('record');
  });

  it('playing meet → Postpone is reversible, so it stays one press and stays quiet', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={onAction} />);

    fireEvent.click(screen.getByTestId('run-act-postpone'));
    expect(onAction).toHaveBeenCalledWith('postpone');

    // ...and the two are no longer visually interchangeable: the terminal
    // action carries the accent, the reversible one the neutral border.
    expect(screen.getByTestId('run-act-record').className).toMatch(/bg-accent/);
    expect(screen.getByTestId('run-act-postpone').className).not.toMatch(/bg-accent/);
  });

  // The rail used to render two identical accent buttons, "A wins" and "B
  // wins", four pixels apart and differing by one letter — for an irreversible
  // write. Recording a bracket result now belongs to the bracket's own
  // MatchDetailPanel, which RunSurface stacks below this rail once the match is
  // playing: armed winner buttons carrying the real side names, plus set
  // scores and Undo start.
  // O1. The audit measured Record result and Postpone ~10px apart in one
  // wrapped flex row: a terminal write and a reversible one, same size, one
  // gap. Record arms; Postpone does not, and should not (arming a reversible
  // action teaches the operator the arm means nothing). So the fix is
  // DISTANCE — Postpone moves into its own labelled section, a hairline and a
  // section's padding away, and the two are no longer one slip apart.
  it('Record result and Postpone are not siblings: the terminal action stands alone', () => {
    const m = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={vi.fn()} />);

    const recordSection = screen.getByTestId('run-act-record').closest('section');
    const postponeSection = screen.getByTestId('run-act-postpone').closest('section');

    expect(recordSection).not.toBeNull();
    expect(postponeSection).not.toBeNull();
    expect(recordSection).not.toBe(postponeSection);
    // ...and the reversible one is named where it now lives, rather than
    // stranded under the terminal action's heading.
    expect(within(postponeSection!).getByText('RESCHEDULE')).toBeInTheDocument();
  });

  // O5. The rail was `space-y-3 p-4` — eight fields, no headings, no rules, no
  // eyebrow anywhere — while the panel grammar every other dock uses sat
  // unused. Every group now says what it is, in the one imported recipe.
  it('every group in the rail carries a heading', () => {
    const m = mkMatch({
      key: 'meet:m1', id: 'm1', source: 'meet', label: 'MS1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={vi.fn()} />);

    for (const eyebrow of ['STATUS', 'PLAYERS', 'ACTIONS', 'RESCHEDULE']) {
      expect(screen.getByText(eyebrow)).toBeInTheDocument();
    }
    // Fields are labelled too, not a bare stack of values.
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Court')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
  });

  // O7. The rail named the bracket engine "Brkt" while the queue square two
  // inches away called it "B" and every tooltip on the surface said "Bracket".
  // One vocabulary: the shared SourceChip.
  it('names the engine the way the rest of the surface does', () => {
    const m = mkMatch({
      key: 'bracket:pu1', id: 'pu1', source: 'bracket', label: 'QF1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={vi.fn()} />);

    expect(screen.getByTestId('source-chip-bracket')).toHaveTextContent('Bracket');
    expect(screen.queryByText('Brkt')).toBeNull();
  });

  it('playing bracket → no inline winner buttons; the bracket panel owns recording', () => {
    const onAction = vi.fn();
    const m = mkMatch({
      key: 'bracket:pu1', id: 'pu1', source: 'bracket', label: 'QF1', status: 'playing',
    });
    render(<RunInspector match={m} role="now" onAction={onAction} />);

    expect(screen.queryByTestId('run-act-win-a')).toBeNull();
    expect(screen.queryByTestId('run-act-win-b')).toBeNull();
    expect(screen.queryByTestId('run-act-record')).toBeNull();
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
        'Queued behind MS1 on C1. Advances when the court clears.',
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
      screen.getByText('No court is free yet. Waiting for one to clear.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('run-act-send')).toBeNull();
  });
});
