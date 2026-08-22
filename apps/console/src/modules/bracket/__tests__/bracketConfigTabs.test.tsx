/**
 * Bracket Configuration is ONE surface — the Engine/Events switcher is gone.
 *
 * It used to be two tabs behind a `Seg`. Meet's identical switcher was merged
 * first; leaving Bracket's in place is what made the config unification look
 * half-done. Both engines now render a single stack of collapsible sections:
 * Events (the draw facts, read-only) leads, then the shared Scoring / Timing /
 * Optimisation goals / Advanced scheduling.
 *
 * The load-bearing property these tests hold is that the merge did NOT create
 * a second config writer: Events comes in through `EngineConfigForm`'s
 * `leadingSections` slot and writes nothing, so there is exactly one save
 * path. Two forms each spreading the whole config would clobber each other
 * silently — see the save test below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BracketTab } from '../BracketTab';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useBracket } from '../../../hooks/useBracket';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

vi.mock('../../../hooks/useBracket', () => ({
  useBracket: vi.fn(),
}));

vi.mock('../../../api/bracketClient', async () => {
  const React = await import('react');
  const BracketApiContext = React.createContext<object | null>(null);
  return {
    BracketApiContext,
    BracketApiProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(BracketApiContext.Provider, { value: {} }, children),
    useBracketApi: () => ({ get: vi.fn().mockResolvedValue(null) }),
  };
});

function populated(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [
      {
        id: 'MS-1', discipline: 'MS', format: 'se',
        bracket_size: 8, participant_count: 6, rounds: [], status: 'generated',
      },
      {
        id: 'WD-1', discipline: 'WD', format: 'rr',
        bracket_size: 4, participant_count: 4, rounds: [], status: 'draft',
      },
    ],
    participants: [],
    play_units: [],
    assignments: [],
    results: [],
  };
}


/** Config sections are collapsed by default; a collapsed section renders no
 *  controls, so every assertion about a control (and especially every
 *  negative one, which would otherwise pass vacuously) opens them first. */
function expandConfigSections() {
  screen
    .getAllByRole('button', { expanded: false })
    .forEach((btn) => fireEvent.click(btn));
}

function renderBracketTab() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1']}>
      <Routes>
        <Route path="/tournaments/:id" element={<BracketTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useBracket).mockReturnValue({
    data: populated(),
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
  useUiStore.setState({ activeTab: 'bracket-setup' });
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      courtCount: 4,
      restBetweenRounds: 1,
      breaks: [],
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      scoringFormat: 'simple',
      setsToWin: 2,
      pointsPerSet: 21,
      deuceEnabled: true,
      tournamentName: 'Bracket A',
    },
    bracketPlayers: [],
  });
});

describe('Bracket Configuration — one merged surface', () => {
  it('has no Engine/Events switcher', () => {
    renderBracketTab();
    expandConfigSections();
    // The switcher's radios. Asserting their absence is only meaningful
    // alongside the next test, which proves BOTH sets of fields are on the
    // page — otherwise this would pass just as well on a blank surface.
    expect(screen.queryByRole('radio', { name: /^Engine$/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Events$/i })).toBeNull();
  });

  it('renders the Events facts and the engine fields together, no navigation', () => {
    renderBracketTab();
    expandConfigSections();

    // Formerly the Events tab: per-draw facts, read from the existing draws.
    // COPY-3: the "Active disciplines" summary row is GONE — it restated, as
    // a wrapped comma list, exactly the disciplines the rows below name.
    expect(screen.queryByText(/Active disciplines/i)).toBeNull();
    expect(screen.getByText("Men's Singles")).toBeInTheDocument();
    expect(screen.getByText('MS-1')).toBeInTheDocument();
    expect(screen.getByText(/Single elimination · 8 · 6 seeded/)).toBeInTheDocument();
    expect(screen.getByText(/Round robin · 4 · 4 seeded/)).toBeInTheDocument();

    // Formerly the Engine tab: the same scoring field set as Meet, plus the
    // one declared bracket-specific knob. Simultaneously visible — no click
    // between the two groups.
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    expect(screen.getByLabelText('Points per set')).toBeInTheDocument();
    expect(screen.getByLabelText('Match format')).toBeInTheDocument();
    expect(screen.getByLabelText('Deuce enabled')).toBeInTheDocument();
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
  });

  it('sections are collapsible and start expanded, with solver internals closed', () => {
    renderBracketTab();
    const events = screen.getByRole('button', { name: /^Events$/ });
    expect(events).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('MS-1')).toBeInTheDocument();

    fireEvent.click(events);
    expect(events).toHaveAttribute('aria-expanded', 'false');
    // Collapsed content leaves the DOM — the reason every negative assertion
    // on this surface has to open the sections first.
    expect(screen.queryByText('MS-1')).toBeNull();

    expect(screen.getByRole('button', { name: /Advanced scheduling/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('there is ONE save path: the merged surface writes engine fields and nothing else', async () => {
    // The merge hazard. `EngineConfigForm` spreads the WHOLE config on
    // submit, so a second form on the page that did the same would silently
    // overwrite this one's fields with its own stale copy. Events is a
    // read-only slot, so exactly one Save exists and the write it produces
    // carries the edited engine field.
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderBracketTab();
    expandConfigSections();

    expect(screen.getAllByRole('button', { name: /^Save/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole('radio', { name: 'Sets' }));
    expect(setConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Save engine settings/i }));
    await waitFor(() => expect(setConfig).toHaveBeenCalled());
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0];
    expect(last.scoringFormat).toBe('badminton');
    // The rest of the config survived the write — nothing was clobbered by
    // an unrelated section rendering on the same page.
    expect(last.tournamentName).toBe('Bracket A');
    expect(last.courtCount).toBe(4);
  });

  it('routes to Draws and Roster from the Events section', () => {
    renderBracketTab();
    expandConfigSections();
    expect(screen.getByTestId('bracket-open-draws')).toBeInTheDocument();
    expect(screen.getByTestId('bracket-open-roster')).toBeInTheDocument();
  });
});
