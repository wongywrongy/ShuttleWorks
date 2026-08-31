import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { meetMatchIdentity } from '../../../platform/domain/matchIdentity';
import {
  MatchInspector,
  type MatchInspectorModel,
  type MatchInspectorProps,
} from '../MatchInspector';

const makeMatch = (
  overrides: Partial<MatchInspectorModel> = {},
): MatchInspectorModel => ({
  key: 'meet:match-machine-id-123456',
  id: 'match-machine-id-123456',
  identity: meetMatchIdentity({
    event_code: 'MS',
    position: 1,
    sequence: 7,
  }),
  status: 'Ready',
  sideA: 'Alex Kim',
  sideB: 'Robin Singh',
  assignment: {
    court: 3,
    planned: '10:30',
  },
  result: null,
  ...overrides,
});

const renderInspector = (
  props: Partial<MatchInspectorProps> = {},
) => render(
  <MatchInspector
    match={makeMatch()}
    defaultFacet="summary"
    onClose={vi.fn()}
    testId="universal-match"
    {...props}
  />,
);

describe('F-UNI-11/F-UNI-14 — shared MatchInspector invocation state', () => {
  it('opens on the caller default, preserves a choice through refresh, and resets for context or match changes', () => {
    const { rerender } = renderInspector({ defaultFacet: 'assignment' });

    expect(screen.getByTestId('universal-match-panel-assignment')).toBeInTheDocument();
    expect(screen.queryByTestId('universal-match-panel-summary')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Result' }));
    expect(screen.getByTestId('universal-match-panel-result')).toBeInTheDocument();

    // A background data refresh for the same invocation must not throw the
    // operator back to the caller's default facet.
    rerender(
      <MatchInspector
        match={makeMatch({ status: 'Called' })}
        defaultFacet="assignment"
        onClose={vi.fn()}
        testId="universal-match"
      />,
    );
    expect(screen.getByTestId('universal-match-panel-result')).toBeInTheDocument();

    // Context changed while the same match remains selected.
    rerender(
      <MatchInspector
        match={makeMatch({ status: 'Called' })}
        defaultFacet="summary"
        onClose={vi.fn()}
        testId="universal-match"
      />,
    );
    expect(screen.getByTestId('universal-match-panel-summary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Result' }));
    expect(screen.getByTestId('universal-match-panel-result')).toBeInTheDocument();

    // A different shared match identity is a new invocation even when the
    // caller context keeps the same default.
    rerender(
      <MatchInspector
        match={makeMatch({
          key: 'meet:another-match-id',
          id: 'another-match-id',
          identity: meetMatchIdentity({ event_code: 'MS', position: 2, sequence: 8 }),
        })}
        defaultFacet="summary"
        onClose={vi.fn()}
        testId="universal-match"
      />,
    );
    expect(screen.getByTestId('universal-match-panel-summary')).toBeInTheDocument();
  });

  it('opens and changes subjects without issuing an incremental read', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { rerender } = renderInspector();

    rerender(
      <MatchInspector
        match={makeMatch({ key: 'meet:second', id: 'second' })}
        defaultFacet="summary"
        onClose={vi.fn()}
        testId="universal-match"
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('F-UNI-12/F-UNI-15 — shared MatchInspector identity and status ink', () => {
  it('renders one plain status line without a STATUS heading or exceptional-state container', () => {
    renderInspector();
    const inspector = screen.getByTestId('universal-match');
    const status = screen.getByTestId('universal-match-status');

    expect(status.tagName).toBe('P');
    expect(within(inspector).getAllByText('Ready')).toHaveLength(1);
    expect(within(inspector).queryByText(/^status$/i)).toBeNull();
    expect(within(inspector).queryByRole('heading', { name: /^status$/i })).toBeNull();
    expect(status.className).not.toMatch(/\b(?:rounded|bg-status-|border-status-)\S*/);
  });

  it('renders formatted identity without leaking source or raw machine id', () => {
    renderInspector();
    const inspector = screen.getByTestId('universal-match');

    expect(within(inspector).getByText('MS1')).toBeInTheDocument();
    expect(within(inspector).queryByText('match-machine-id-123456')).toBeNull();
    expect(within(inspector).queryByText(/^meet$/i)).toBeNull();
  });
});
