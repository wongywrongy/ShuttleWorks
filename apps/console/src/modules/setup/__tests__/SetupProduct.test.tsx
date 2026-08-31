import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SetupProduct } from '../SetupProduct';
import type { TournamentSetupDTO } from '../../../api/dto';

const mocks = vi.hoisted(() => ({
  getTournamentSetup: vi.fn(),
  patchTournamentSetup: vi.fn(),
}));
const { getTournamentSetup, patchTournamentSetup } = mocks;

vi.mock('../../../api/client', () => ({
  apiClient: mocks,
}));

function setupFixture(): TournamentSetupDTO {
  return {
    tournamentId: 't1',
    status: 'blocked',
    blockingIssueCount: 2,
    sections: [
      { key: 'general', status: 'ready', summary: 'Ready', data: { name: 'Spring Finals', timezone: 'Europe/London' }, issues: [], downstreamImpact: ['Overview'], authority: 'setup' },
      { key: 'dates', status: 'blocked', summary: '1 blocking issue', data: { tournamentStart: '2026-09-01T09:00:00Z' }, issues: [{ code: 'SETUP_DATES_START_REQUIRED', severity: 'blocking', message: 'Set the tournament start date — registration, scheduling, and the public calendar all key on it.', path: 'tournamentStart' }], downstreamImpact: ['scheduling'], authority: 'setup' },
      { key: 'venue', status: 'ready', summary: 'Ready', data: { venueName: 'Main hall', courts: [{ id: 'court-1', name: 'Court 1', available: true }] }, issues: [], downstreamImpact: ['Plan'], authority: 'domain' },
      { key: 'events', status: 'ready', summary: 'Ready', data: { events: [{ id: 'MS', code: 'MS', name: "Men's Singles", discipline: 'MS', status: 'started' }] }, issues: [], downstreamImpact: ['Competition'], authority: 'domain' },
      { key: 'rules', status: 'not_started', summary: 'Not started', data: {}, issues: [], downstreamImpact: ['draw generation'], authority: 'setup' },
      { key: 'entries', status: 'not_started', summary: 'Not started', data: {}, issues: [], downstreamImpact: ['registration'], authority: 'setup' },
      { key: 'people', status: 'not_started', summary: 'Not started', data: {}, issues: [], downstreamImpact: ['operator contacts'], authority: 'setup' },
      { key: 'public-info', status: 'not_started', summary: 'Not started', data: {}, issues: [], downstreamImpact: ['public site'], authority: 'setup' },
    ],
  };
}

beforeEach(() => {
  getTournamentSetup.mockReset();
  patchTournamentSetup.mockReset();
  getTournamentSetup.mockResolvedValue(setupFixture());
  patchTournamentSetup.mockResolvedValue(setupFixture());
});

describe('SetupProduct', () => {
  const renderSetup = (path = '/tournaments/t1/setup') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <SetupProduct tid="t1" />
      </MemoryRouter>,
    );

  it('renders the full checklist ONCE, on the landing (RDY-3)', async () => {
    renderSetup('/tournaments/t1/setup');
    await waitFor(() => expect(screen.getByText('Readiness checklist')).toBeInTheDocument());
    expect(screen.getByText('General identity')).toBeInTheDocument();
    expect(screen.getByText('Public information')).toBeInTheDocument();
    expect(screen.getAllByText(/2 blocking/).length).toBeGreaterThan(0);
    // The landing has no section editor.
    expect(screen.queryByRole('button', { name: 'Save section' })).not.toBeInTheDocument();
  });

  it('section pages show the one-line strip, not the checklist card', async () => {
    renderSetup('/tournaments/t1/setup/dates');
    await waitFor(() => expect(screen.getByTestId('setup-strip')).toBeInTheDocument());
    expect(screen.queryByText('Readiness checklist')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View full checklist' })).toHaveAttribute(
      'href',
      '/tournaments/t1/setup',
    );
    // RDY-2: the issue renders as the operator sentence, never "Field: x".
    expect(screen.getByText(/registration, scheduling, and the public calendar/)).toBeInTheDocument();
    expect(screen.queryByText(/Field: tournamentStart/)).not.toBeInTheDocument();
  });

  it('patches only the selected section (RDY-4 impact wording present)', async () => {
    const user = userEvent.setup();
    renderSetup('/tournaments/t1/setup/dates');
    await waitFor(() => expect(screen.getByLabelText('Tournament starts')).toBeInTheDocument());
    expect(screen.getByText(/Saving this updates: scheduling\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save section' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith('t1', 'dates', expect.any(Object)));
  });

  it('renders a domain-owned events section read-only with a link to the owner (R-N A)', async () => {
    renderSetup('/tournaments/t1/setup/events');
    await waitFor(() => expect(screen.getByText("Men's Singles")).toBeInTheDocument());
    // No editor, no save: the state that showed an empty textarea over five
    // running draws (evidence S09) is structurally impossible.
    expect(screen.queryByRole('button', { name: 'Save section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add event' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage events in Competition/ })).toBeInTheDocument();
  });

  it('structured row editors replace the pipe textareas (INP-1)', async () => {
    const user = userEvent.setup();
    getTournamentSetup.mockResolvedValueOnce({
      ...setupFixture(),
      sections: setupFixture().sections.map((section) => section.key === 'venue'
        ? { ...section, authority: 'setup' as const, data: { courts: [] } }
        : section),
    });
    renderSetup('/tournaments/t1/setup/venue');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add court' })).toBeInTheDocument());
    expect(document.querySelector('textarea')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add court' }));
    expect(screen.getByLabelText('Court name for row 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Available for row 1')).toBeInTheDocument();
  });

  it('rules render segmented controls, and no Refresh button exists (INP-2/INP-3)', async () => {
    renderSetup('/tournaments/t1/setup/rules');
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Score type' })).toBeInTheDocument());
    expect(screen.getByRole('radiogroup', { name: 'Points per set' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Match format' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Deuce enabled' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('scheduled venue is read-only and links to Operations · Plan (R-N A)', async () => {
    renderSetup('/tournaments/t1/setup/venue');
    await waitFor(() => expect(screen.getByText('Court 1')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Save section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add court' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage the schedule in Operations · Plan/ })).toHaveAttribute(
      'href',
      '/tournaments/t1/operations/plan',
    );
  });
});
