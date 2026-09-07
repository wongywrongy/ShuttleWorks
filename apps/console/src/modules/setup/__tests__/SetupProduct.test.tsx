import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
      { key: 'public-info', status: 'not_started', summary: 'Not started', data: { publicSlug: 'spring-finals', visibility: 'public', description: 'Welcome' }, issues: [], downstreamImpact: ['public site'], authority: 'setup' },
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
    expect(screen.getByText('Tournament details')).toBeInTheDocument();
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

  it('does not repeat a healthy section status beside the editor', async () => {
    renderSetup('/tournaments/t1/setup/general');
    await waitFor(() => expect(screen.getByLabelText('Tournament name')).toBeInTheDocument());
    expect(screen.queryByTestId('setup-strip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save section' })).toBeDisabled();
  });

  it('patches only the selected section (RDY-4 impact wording present)', async () => {
    const user = userEvent.setup();
    renderSetup('/tournaments/t1/setup/dates');
    await waitFor(() => expect(screen.getByLabelText('Tournament starts')).toBeInTheDocument());
    expect(screen.getByText(/Saving this updates: scheduling\./)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Tournament starts'));
    await user.type(screen.getByLabelText('Tournament starts'), '2026-09-01T10:00');
    await user.click(screen.getByRole('button', { name: 'Save section' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith('t1', 'dates', expect.any(Object)));
  });

  it('renders a domain-owned events section read-only with a link to the owner (R-N A)', async () => {
    renderSetup('/tournaments/t1/setup/events');
    await waitFor(() => expect(screen.getByText(/Men's Singles/)).toBeInTheDocument());
    // No editor, no save: the state that showed an empty textarea over five
    // running draws (evidence S09) is structurally impossible.
    expect(screen.queryByRole('button', { name: 'Save section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add event' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit event' })).toHaveAttribute('href', '/tournaments/t1/competition/draws?event=MS');
  });

  it('V3-OC09.1: event capacity carries a pairs/players unit, and the discipline code is secondary text', async () => {
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => section.key === 'events'
      ? { ...section, data: { events: [
          { id: 'MS', code: 'MS', name: "Men's Singles", discipline: 'MS', capacity: 32, status: 'started' },
          { id: 'MD', code: 'MD', name: 'MD', discipline: 'MD', capacity: 16, status: 'started' },
        ] } }
      : section);
    getTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/events');
    await waitFor(() => expect(screen.getByText(/32 players/)).toBeInTheDocument());
    expect(screen.getByText(/16 pairs/)).toBeInTheDocument();
    // No custom name was configured for MD (name === discipline code), so
    // the full discipline name renders with the code demoted to secondary
    // text — never the bare code as the primary label.
    expect(screen.getByText(/Men's Doubles/)).toBeInTheDocument();
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

  it('V3-OC07.2: only existing named courts can be selected, as a checkbox list', async () => {
    const user = userEvent.setup();
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => {
      if (section.key === 'venue') {
        return { ...section, data: { courts: [
          { id: 'venue-west-main', name: 'Main court', available: true },
          { id: 'court-with_opaque_name', name: 'Court 2', available: true },
        ] } };
      }
      if (section.key === 'dates') {
        return { ...section, data: { ...section.data, dailySessions: [
          { id: 'session-1', name: 'Day 1', date: '2026-09-01', startTime: '09:00', endTime: '18:00', courtIds: ['venue-west-main', 'court-with_opaque_name'] },
          { id: 'session-2', name: 'Day 2', date: '2026-09-02', startTime: '09:00', endTime: '18:00', courtIds: ['legacy-court-id'] },
        ] } };
      }
      return section;
    });
    getTournamentSetup.mockResolvedValueOnce(fixture);
    patchTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/dates');
    // Both named courts render as checkboxes, checked for the session that
    // uses them — no comma-separated free text, no repeated helper string.
    const mainCourtRow1 = await screen.findByLabelText('Main court: Courts for row 1');
    const court2Row1 = screen.getByLabelText('Court 2: Courts for row 1');
    expect(mainCourtRow1).toBeChecked();
    expect(court2Row1).toBeChecked();
    // A session referencing a court that no longer exists in Venue shows no
    // checkbox checked for it (it cannot be selected), but is left alone —
    // untouched checkboxes never clobber a value they cannot represent.
    expect(screen.getByLabelText('Main court: Courts for row 2')).not.toBeChecked();
    expect(screen.getByLabelText('Court 2: Courts for row 2')).not.toBeChecked();
    // Touch an unrelated field to make the draft dirty (Save starts disabled
    // with "No changes") without altering either session's court selection.
    fireEvent.change(screen.getByLabelText('Name for row 1'), { target: { value: 'Day 1 (final)' } });
    await user.click(screen.getByRole('button', { name: 'Save section' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith(
      't1',
      'dates',
      expect.objectContaining({
        dailySessions: expect.arrayContaining([
          expect.objectContaining({ courtIds: ['venue-west-main', 'court-with_opaque_name'] }),
          expect.objectContaining({ courtIds: ['legacy-court-id'] }),
        ]),
      }),
    ));
  });

  it('does not send publication audience when saving public information', async () => {
    const user = userEvent.setup();
    renderSetup('/tournaments/t1/setup/public-info');
    await waitFor(() => expect(screen.getByLabelText('Description')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Description'), ' updated');
    await user.click(screen.getByRole('button', { name: 'Save section' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalled());
    expect(patchTournamentSetup.mock.calls[0][2]).not.toHaveProperty('visibility');
    expect(patchTournamentSetup.mock.calls[0][2]).toMatchObject({ publicSlug: 'spring-finals', description: 'Welcome updated' });
  });

  it('rules render segmented controls, and no Refresh button exists (INP-2/INP-3)', async () => {
    renderSetup('/tournaments/t1/setup/rules');
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Score type' })).toBeInTheDocument());
    expect(screen.getByRole('radiogroup', { name: 'Points per game' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Match format' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Deuce enabled' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('V3-OC10.1: exposes the configured point cap only when deuce is enabled', async () => {
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => section.key === 'rules'
      ? { ...section, data: { deuceEnabled: true, pointCap: 30 } }
      : section);
    getTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/rules');
    const capField = await screen.findByLabelText('Point cap');
    expect(capField).toHaveValue(30);
    expect(screen.getByText('pts')).toBeInTheDocument();
  });

  it('V3-OC10.1: hides the point cap field when deuce is off, and never invents a cap', async () => {
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => section.key === 'rules'
      ? { ...section, data: { deuceEnabled: false } }
      : section);
    getTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/rules');
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Score type' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Point cap')).not.toBeInTheDocument();
  });

  it('V3-OC11.1: labels the partner field as instructions, distinct from the enforced switches below', async () => {
    renderSetup('/tournaments/t1/setup/entries');
    await waitFor(() => expect(screen.getByLabelText('Partner instructions')).toBeInTheDocument());
    expect(screen.queryByLabelText('Partner rules')).not.toBeInTheDocument();
    expect(screen.getByText(/not enforced/i)).toBeInTheDocument();
  });

  it('V3-OC07.1: an out-of-window session renders a precise, session-named conflict', async () => {
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => section.key === 'dates'
      ? { ...section, status: 'blocked' as const, issues: [{
          code: 'SETUP_DATES_SESSION_OUT_OF_WINDOW',
          severity: 'blocking' as const,
          message: '"Competition day 1" starts before the tournament start. Move the tournament start earlier, or change this session’s date or time.',
          path: 'dailySessions.day-1',
        }] }
      : section);
    getTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/dates');
    await waitFor(() => expect(screen.getByText(/Competition day 1/)).toBeInTheDocument());
    expect(screen.getByText(/starts before the tournament start/)).toBeInTheDocument();
  });

  it('V3-OC07.3: the clock-change note is contextual, not a blanket sentence', async () => {
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => section.key === 'general'
      ? { ...section, data: { ...section.data, timezone: 'America/New_York' } }
      : section);
    getTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/dates');
    await waitFor(() => expect(screen.getByText(/All times are in America/)).toBeInTheDocument());
    expect(screen.queryByText(/occurs twice/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Repeated clock-change/)).not.toBeInTheDocument();
    const input = screen.getByLabelText('Tournament starts');
    fireEvent.change(input, { target: { value: '2026-11-01T01:30' } });
    await waitFor(() => expect(screen.getByText(/occurs twice here due to a clock change/)).toBeInTheDocument());
  });

  it('scheduled venue is read-only and links to Operations · Plan (R-N A)', async () => {
    renderSetup('/tournaments/t1/setup/venue');
    await waitFor(() => expect(screen.getByText('Court 1')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Save section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add court' })).not.toBeInTheDocument();
    expect(screen.getByText(/Venue details and courts are locked here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage the schedule in Operations · Plan/ })).toHaveAttribute(
      'href',
      '/tournaments/t1/operations/plan',
    );
  });
  it('keeps a dirty draft on focus and after a failed save, then discards it', async () => {
    patchTournamentSetup.mockRejectedValue(new Error('network'));
    renderSetup('/tournaments/t1/setup/general');
    const input = await screen.findByLabelText('Tournament name');
    const original = (input as HTMLInputElement).value;
    fireEvent.change(input, { target: { value: 'Unsent title' } });
    fireEvent(window, new Event('focus'));
    expect(getTournamentSetup).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('Unsent title');
    fireEvent.click(screen.getByRole('button', { name: 'Save section' }));
    await screen.findByText(/Your draft is still here/);
    expect(input).toHaveValue('Unsent title');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByLabelText('Tournament name')).toHaveValue(original));
  });

  it('keeps an invalid DST time visible and prevents saving an old value', async () => {
    const fixture = setupFixture();
    fixture.sections.find((section) => section.key === 'general')!.data.timezone = 'America/New_York';
    getTournamentSetup.mockResolvedValue(fixture);
    renderSetup('/tournaments/t1/setup/dates');
    const input = await screen.findByLabelText('Tournament starts');
    fireEvent.change(input, { target: { value: '2026-03-08T02:30' } });
    expect(input).toHaveValue('2026-03-08T02:30');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('does not exist');
    fireEvent.click(screen.getByRole('button', { name: 'Save section' }));
    expect(patchTournamentSetup).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '2026-03-08T03:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save section' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith('t1', 'dates', expect.objectContaining({ tournamentStart: '2026-03-08T07:30:00.000Z' })));
  });

});
