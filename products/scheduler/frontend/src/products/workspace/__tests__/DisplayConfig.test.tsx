/**
 * Tests for DisplayConfig's "Board layout" + "Preview" mount (Task 6).
 * The existing Feeds + Public link sections are untouched (no coverage
 * regression to guard there — verified by inspection, not duplicated here).
 * tv* fields only drive the Meet board, so the new sections are gated to
 * Meet-enabled workspaces.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisplayConfig } from '../DisplayConfig';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { WorkspaceModule } from '../../../platform/product-shell/types';

const MEET_ON: WorkspaceModule[] = [{ id: 'meet', label: 'Meet', status: 'enabled' }];
const BRACKET_ONLY: WorkspaceModule[] = [
  { id: 'meet', label: 'Meet', status: 'disabled' },
  { id: 'bracket', label: 'Bracket', status: 'enabled' },
];

beforeEach(() => {
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
    },
  });
});

describe('<DisplayConfig /> — Board layout + Preview mount', () => {
  it('shows Board layout + Preview when Meet is enabled', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    expect(screen.getByRole('heading', { name: 'Board layout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
    expect(screen.getByTestId('display-preview-frame')).toBeInTheDocument();
  });

  it('hides Board layout + Preview for a bracket-only workspace (tv* fields do not drive it)', () => {
    render(<DisplayConfig tid="t1" modules={BRACKET_ONLY} />);
    expect(screen.queryByRole('heading', { name: 'Board layout' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Preview' })).toBeNull();
  });

  it('still renders the existing Feeds + Public link sections untouched', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    expect(screen.getByRole('heading', { name: 'Feeds' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Public display URL')).toBeInTheDocument();
  });

  // Locks the headline feature end-to-end: editor -> store -> preview, with
  // no Save step. Proves the "live" in "live preview" isn't just correct by
  // construction (new config object -> selector re-render -> new prop) but
  // actually observable: toggling "Show scores" makes the sample match's
  // score disappear from the preview frame in the SAME render pass, with no
  // debounced PUT needed (setConfig writes to the store synchronously).
  it('reflects an unsaved editor edit in the preview immediately (live-draft preview)', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    const preview = screen.getByTestId('display-preview-frame');
    expect(preview).toHaveTextContent('11–7');

    fireEvent.click(screen.getByRole('switch', { name: 'Show scores' }));

    expect(preview).not.toHaveTextContent('11–7');
  });
});
