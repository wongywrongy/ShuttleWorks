import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SetupProduct } from '../SetupProduct';
import type { TournamentSetupDTO } from '../../../api/dto';

const mocks = vi.hoisted(() => ({
  getTournamentSetup: vi.fn(),
  patchTournamentSetup: vi.fn(),
  getEntryPage: vi.fn(),
  patchEntryPagePublication: vi.fn(),
}));
const { getTournamentSetup, patchTournamentSetup } = mocks;

vi.mock('../../../api/client', () => ({
  apiClient: mocks,
}));

// Publication is its own transaction with its own load; it is rendered beside
// the public content it governs but is not what these tests are about.
vi.mock('../../../components/PublicationSettings', () => ({
  PublicationSettings: () => <div data-testid="publication-settings" />,
}));

function setupFixture(): TournamentSetupDTO {
  return {
    tournamentId: 't1',
    status: 'blocked',
    blockingIssueCount: 2,
    sections: [
      { key: 'general', status: 'ready', summary: 'Ready', data: { name: 'Spring Finals', timezone: 'Europe/London' }, issues: [], downstreamImpact: ['Overview'], authority: 'setup' },
      { key: 'dates', status: 'blocked', summary: '1 blocking issue', data: { tournamentStart: '2026-09-01T09:00:00Z' }, issues: [{ code: 'SETUP_DATES_START_REQUIRED', severity: 'blocking', message: 'Set the tournament start date — registration, scheduling, and the public calendar all key on it.', path: 'tournamentStart' }], downstreamImpact: ['scheduling'], authority: 'setup' },
      { key: 'venue', status: 'ready', summary: 'Ready', data: { venueName: 'Main hall', courts: [{ id: 'court-1', name: 'Court 1', available: true }] }, issues: [], downstreamImpact: ['Plan'], authority: 'setup' },
      { key: 'events', status: 'ready', summary: 'Ready', data: { events: [{ id: 'MS', code: 'MS', name: "Men's Singles", discipline: 'MS', status: 'started' }] }, issues: [], downstreamImpact: ['the draws'], authority: 'domain' },
      { key: 'rules', status: 'not_started', summary: 'Not started', data: {}, issues: [], downstreamImpact: ['draw generation'], authority: 'setup' },
      { key: 'entries', status: 'not_started', summary: 'Not started', data: { partnerRules: 'Bring your own partner.' }, issues: [], downstreamImpact: ['registration'], authority: 'setup' },
      { key: 'people', status: 'not_started', summary: 'Not started', data: {}, issues: [], downstreamImpact: ['operator contacts'], authority: 'setup' },
      { key: 'public-info', status: 'not_started', summary: 'Not started', data: { publicSlug: 'spring-finals', visibility: 'public', description: 'Welcome', regulationsText: '' }, issues: [], downstreamImpact: ['public site'], authority: 'setup' },
    ],
  };
}

beforeEach(() => {
  getTournamentSetup.mockReset();
  patchTournamentSetup.mockReset();
  getTournamentSetup.mockResolvedValue(setupFixture());
  patchTournamentSetup.mockResolvedValue(setupFixture());
});

describe('SetupProduct — four consolidated pages', () => {
  const renderSetup = (path = '/tournaments/t1/setup/details') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <SetupProduct tid="t1" />
      </MemoryRouter>,
    );

  it('Details owns name, dates, venue, courts, sessions and staff in one page', async () => {
    renderSetup('/tournaments/t1/setup/details');
    await waitFor(() => expect(screen.getByLabelText('Tournament name')).toBeInTheDocument());
    expect(screen.getByLabelText('Tournament starts')).toBeInTheDocument();
    expect(screen.getByLabelText('Venue name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add court' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeInTheDocument();
    // Navigation and the heading identify the page; no `SETUP · …` eyebrow.
    expect(screen.queryByText(/^Setup ·/)).toBeNull();
    // The readiness checklist belongs to Overview, once.
    expect(screen.queryByText('Readiness checklist')).toBeNull();
  });

  it('uses date-only controls for the tournament start and end', async () => {
    renderSetup('/tournaments/t1/setup/details');
    const start = await screen.findByLabelText('Tournament starts');
    expect(start).toHaveAttribute('type', 'date');
    expect(start).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Tournament ends')).toHaveAttribute('type', 'date');
  });

  it('keeps venue and courts editable after a schedule exists', async () => {
    renderSetup('/tournaments/t1/setup/details');
    await waitFor(() => expect(screen.getByLabelText('Venue name')).toBeEnabled());
    expect(screen.queryByText(/locked here/i)).toBeNull();
    fireEvent.change(screen.getByLabelText('Venue name'), { target: { value: 'Hall B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith(
      't1',
      'venue',
      expect.objectContaining({ venueName: 'Hall B' }),
    ));
  });

  it('patches only the sections the operator actually changed', async () => {
    renderSetup('/tournaments/t1/setup/details');
    const name = await screen.findByLabelText('Tournament name');
    fireEvent.change(name, { target: { value: 'Spring Finals 2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledTimes(1));
    expect(patchTournamentSetup.mock.calls[0][1]).toBe('general');
  });

  it('does not claim success when one section of a multi-section save fails', async () => {
    patchTournamentSetup
      .mockResolvedValueOnce(setupFixture())
      .mockRejectedValueOnce(new Error('network'));
    renderSetup('/tournaments/t1/setup/details');
    const name = await screen.findByLabelText('Tournament name');
    fireEvent.change(name, { target: { value: 'Spring Finals 2026' } });
    fireEvent.change(screen.getByLabelText('Venue name'), { target: { value: 'Hall B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/1 of 2 changed sections were saved/);
    // The unsaved edit is still on screen.
    expect(screen.getByLabelText('Venue name')).toHaveValue('Hall B');
  });

  it('Entries puts the entry windows beside the entry requirements', async () => {
    renderSetup('/tournaments/t1/setup/entries');
    await waitFor(() => expect(screen.getByLabelText('Entries open')).toBeInTheDocument());
    expect(screen.getByLabelText('Entry deadline')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Payment required' })).toBeInTheDocument();
    // The inert Partner instructions control is gone…
    expect(screen.queryByLabelText('Partner instructions')).toBeNull();
  });

  it('preserves stored partner instructions it no longer renders', async () => {
    renderSetup('/tournaments/t1/setup/entries');
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Payment required' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('switch', { name: 'Payment required' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith(
      't1',
      'entries',
      expect.objectContaining({ partnerRules: 'Bring your own partner.', paymentRequired: true }),
    ));
  });

  it('Scoring holds only scoring — format, draw size and rest moved out', async () => {
    renderSetup('/tournaments/t1/setup/scoring');
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Score type' })).toBeInTheDocument());
    expect(screen.getByRole('radiogroup', { name: 'Points per game' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Deuce enabled' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Default draw format')).toBeNull();
    expect(screen.queryByLabelText('Default draw size')).toBeNull();
    expect(screen.queryByLabelText('Minimum rest between matches')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('names "No limit" instead of a zero sentinel and states the effective rules', async () => {
    const user = userEvent.setup();
    renderSetup('/tournaments/t1/setup/scoring');
    // The stored rules section is empty: 21 / best of 3 / deuce, no cap.
    expect(await screen.findByText(/Best of 3 games to 21, win by 2, no maximum\./)).toBeInTheDocument();
    expect(screen.queryByText('(0 = no cap)')).toBeNull();
    // Standard is the ONE preset the product may name: it writes 21 / best of
    // 3 / win by 2 / cap 30, and the sentence follows the values.
    await user.click(screen.getByRole('radio', { name: 'Standard 21-point' }));
    expect(await screen.findByText(/Best of 3 games to 21, win by 2, capped at 30\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Point cap')).toHaveValue(30);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith(
      't1',
      'rules',
      expect.objectContaining({ pointsPerSet: 21, setsToWin: 2, deuceEnabled: true, pointCap: 30 }),
    ));
  });

  it('V3-OC10.1: exposes the configured point cap only when deuce is enabled', async () => {
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => section.key === 'rules'
      ? { ...section, data: { deuceEnabled: true, pointCap: 30 } }
      : section);
    getTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/scoring');
    expect(await screen.findByLabelText('Point cap')).toHaveValue(30);
  });

  it('Public site edits regulations text and shows publication beside it', async () => {
    const user = userEvent.setup();
    renderSetup('/tournaments/t1/setup/public-site');
    await waitFor(() => expect(screen.getByLabelText('Regulations')).toBeInTheDocument());
    expect(screen.getByTestId('publication-settings')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Regulations'), '1. Warm-up');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalled());
    expect(patchTournamentSetup.mock.calls[0][2]).toMatchObject({ regulationsText: '1. Warm-up' });
    // Audience is owned by the publication transaction, never this write.
    expect(patchTournamentSetup.mock.calls[0][2]).not.toHaveProperty('visibility');
  });

  it('renders a logo preview and offers a retry when the image fails', async () => {
    const fixture = setupFixture();
    fixture.sections = fixture.sections.map((section) => section.key === 'public-info'
      ? { ...section, data: { ...section.data, logoUrl: 'https://example.test/logo.png' } }
      : section);
    getTournamentSetup.mockResolvedValueOnce(fixture);
    renderSetup('/tournaments/t1/setup/public-site');
    const image = await screen.findByAltText('Selected tournament logo');
    fireEvent.error(image);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry preview' }));
    const retried = await screen.findByAltText('Selected tournament logo');
    expect(retried).not.toBe(image);
    expect(retried).toHaveAttribute('src', 'https://example.test/logo.png');
    fireEvent.error(retried);
    expect(await screen.findByRole('button', { name: 'Retry preview' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Logo image link'), {
      target: { value: 'https://example.test/replacement.png' },
    });
    expect(await screen.findByAltText('Selected tournament logo')).toHaveAttribute(
      'src', 'https://example.test/replacement.png',
    );
    expect(screen.queryByRole('button', { name: 'Retry preview' })).toBeNull();
  });

  it('V3-OC07.2: only existing named courts can be selected, as a checkbox list', async () => {
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
    renderSetup('/tournaments/t1/setup/details');
    const mainCourtRow1 = await screen.findByLabelText('Main court: Courts for row 1');
    expect(mainCourtRow1).toBeChecked();
    expect(screen.getByLabelText('Court 2: Courts for row 1')).toBeChecked();
    // A session referencing a court that no longer exists shows no checkbox
    // checked for it, and is left exactly as stored.
    expect(screen.getByLabelText('Main court: Courts for row 2')).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Name for row 1'), { target: { value: 'Day 1 (final)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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
    renderSetup('/tournaments/t1/setup/details');
    await waitFor(() => expect(screen.getByText(/Competition day 1/)).toBeInTheDocument());
    expect(screen.getByText(/starts before the tournament start/)).toBeInTheDocument();
  });

  it('keeps a dirty draft on focus and after a failed save, then discards it', async () => {
    patchTournamentSetup.mockRejectedValue(new Error('network'));
    renderSetup('/tournaments/t1/setup/details');
    const input = await screen.findByLabelText('Tournament name');
    const original = (input as HTMLInputElement).value;
    fireEvent.change(input, { target: { value: 'Unsent title' } });
    fireEvent(window, new Event('focus'));
    expect(getTournamentSetup).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('Unsent title');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/not saved/);
    expect(screen.getByLabelText('Tournament name')).toHaveValue('Unsent title');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByLabelText('Tournament name')).toHaveValue(original));
  });

  it('keeps an invalid entry-deadline time visible and prevents saving an old value', async () => {
    const fixture = setupFixture();
    fixture.sections.find((section) => section.key === 'general')!.data.timezone = 'America/New_York';
    getTournamentSetup.mockResolvedValue(fixture);
    renderSetup('/tournaments/t1/setup/entries');
    const input = await screen.findByLabelText('Entry deadline');
    fireEvent.change(input, { target: { value: '2026-03-08T02:30' } });
    expect(input).toHaveValue('2026-03-08T02:30');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('does not exist');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(patchTournamentSetup).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '2026-03-08T03:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchTournamentSetup).toHaveBeenCalledWith(
      't1',
      'dates',
      expect.objectContaining({ entryDeadline: '2026-03-08T07:30:00.000Z' }),
    ));
  });
});
