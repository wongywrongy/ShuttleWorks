import { identityFixture } from './identityFixture';
/**
 * Contract §10 "Accessibility" row: a court dispute must be a focusable,
 * keyboard-operable assignment with named actions — not a banner. This test
 * exercises RunSurface's derived dispute block directly for that property,
 * separate from the broader integration coverage in runSurface.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useCanEdit', () => ({
  useCanEdit: () => true,
  assertCanEdit: () => true,
}));

const { mockMeetSubmit } = vi.hoisted(() => ({ mockMeetSubmit: vi.fn() }));

vi.mock('../../../hooks/useCommandQueue', () => ({
  useCommandQueue: () => ({ submit: mockMeetSubmit }),
}));
vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({ matchAction: vi.fn(), assignCourt: vi.fn(), unassign: vi.fn() }),
}));
vi.mock('../../../hooks/useBracketResultQueue', () => ({
  useBracketResultQueue: () => ({ submit: vi.fn() }),
}));

import { RunSurface } from '../run/RunSurface';
import { useMatchStateStore } from '../../../store/matchStateStore';
import type { OpsBlock } from '../opsBlock';

function mkBlock(overrides: Partial<OpsBlock> & Pick<OpsBlock, 'id' | 'source' | 'status'>): OpsBlock {
  const { status, source, id } = overrides;
  return {
    key: `${source}:${id}`,
    identity: identityFixture(id),
    span: 1,
    sideA: 'Alice',
    sideB: 'Bob',
    playerIds: [],
    done: status === 'finished',
    started: status === 'started' || status === 'finished',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMatchStateStore.getState().reset();
});

describe('court dispute — accessibility', () => {
  it('is a labelled, focusable group with real buttons, not a status banner', () => {
    const blocks: OpsBlock[] = [
      mkBlock({ id: 'a', source: 'meet', status: 'started', court: 1, slot: 0, sideA: 'Alice', sideB: 'Bob' }),
      mkBlock({ id: 'b', source: 'meet', status: 'started', court: 1, slot: 0, sideA: 'Carol', sideB: 'Dave' }),
    ];
    render(
      <RunSurface blocks={blocks} bracketData={null} onBracketData={vi.fn()} courtCount={1} currentSlot={0} />,
    );

    // Named, addressable group — an assistive-tech user can navigate to it
    // by role + accessible name, the same way they would any other control
    // group, and it is not `role="status"` (the summary band's role).
    const group = screen.getByRole('group', { name: /court 1 needs resolution/i });
    expect(group).toBeInTheDocument();

    // Every resolution action is a real, enabled <button> — natively
    // focusable and keyboard-activatable (Enter/Space), no click-only div.
    const buttons = screen.getAllByRole('button', { name: /Keep this/ });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button).not.toBeDisabled();
      expect(button).not.toHaveAttribute('tabindex', '-1');
    }
  });
});
