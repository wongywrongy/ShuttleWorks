/**
 * `/new` is ONE form: name, date, three module switches, Create.
 *
 * No presets, no tournament type, no venue step, no review step. The routing
 * behaviour these tests pin (kind derived from the seed, land per the RETURNED
 * modules) is unchanged; only the number of screens it takes to get there is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NewWorkspacePage } from '../NewWorkspacePage';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    createTournament: vi.fn(),
    getTournamentState: vi.fn(),
    putTournamentState: vi.fn(),
  },
}));

function LocationProbe({ refObj }: { refObj: { current: string } }) {
  const loc = useLocation();
  refObj.current = loc.pathname + loc.search;
  return null;
}

function mount(refObj: { current: string }) {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route
          path="/new"
          element={<><NewWorkspacePage /><LocationProbe refObj={refObj} /></>}
        />
        <Route path="/tournaments/:id/*" element={<LocationProbe refObj={refObj} />} />
        <Route path="/" element={<LocationProbe refObj={refObj} />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Toggle the remaining independently selectable module. */
function setModule(label: string, state: 'On' | 'Off') {
  const group = screen.getByRole('radiogroup', { name: label });
  fireEvent.click(within(group).getByRole('radio', { name: state }));
}

/** The form requires a name before Create is enabled. */
function fillName(value = 'Spring Invitational') {
  fireEvent.change(screen.getByLabelText(/Name/), { target: { value } });
}

function create() {
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
}

const m = (moduleId: string, status: string) => ({ moduleId, status, config: null });

const seedFor = (call: unknown) =>
  Object.fromEntries(
    ((call as { modules?: { moduleId: string; status: string }[] }).modules ?? []).map(
      (x) => [x.moduleId, x.status],
    ),
  );

const returnCreated = (
  id: string,
  modules: { moduleId: string; status: string; config: null }[],
) =>
  vi.mocked(apiClient.createTournament).mockResolvedValue({
    id,
    kind: 'meet',
    modules,
  } as never);

describe('NewWorkspacePage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.createTournament).mockReset();
    vi.mocked(apiClient.getTournamentState).mockReset();
    vi.mocked(apiClient.putTournamentState).mockReset();
  });

  it('is one form: name, date, three module switches, Create', () => {
    mount({ current: '' });
    expect(screen.getByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date/)).toBeInTheDocument();
    for (const label of ['Meet', 'Bracket', 'Display']) {
      expect(screen.getByRole('radiogroup', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeInTheDocument();
    // The wizard is gone, not merely relabelled.
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Tournament type' })).toBeNull();
    expect(screen.queryByLabelText('Courts')).toBeNull();
    expect(screen.queryByText(/Review/)).toBeNull();
    expect(screen.queryByText(/Included tools/)).toBeNull();
    for (const gone of [/Meet Day/i, /Bracket Tournament/i, /Hybrid Event/i, /Blank Workspace/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('requires a name before it can create', () => {
    mount({ current: '' });
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeDisabled();
    fillName();
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeEnabled();
  });

  it('sends the chosen modules and derives kind=meet', async () => {
    returnCreated('w1', [m('meet', 'enabled'), m('bracket', 'available'), m('display', 'enabled')]);
    const loc = { current: '' };
    mount(loc);
    fillName();
    setModule('Display', 'On');
    create();
    await waitFor(() => expect(loc.current).toBe('/tournaments/w1/setup/details'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('meet');
    expect(body.name).toBe('Spring Invitational');
    // Off seeds as `available`, not `disabled` (R-B).
    expect(seedFor(body)).toMatchObject({
      meet: 'enabled',
      bracket: 'available',
      display: 'enabled',
    });
  });

  it('derives kind=bracket when bracket is the only engine on', async () => {
    returnCreated('w2', [m('bracket', 'enabled'), m('meet', 'available'), m('display', 'available')]);
    const loc = { current: '' };
    mount(loc);
    fillName();
    setModule('Bracket', 'On');
    setModule('Meet', 'Off');
    create();
    await waitFor(() => expect(loc.current).toBe('/tournaments/w2/setup/details'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('bracket');
    expect(seedFor(body)).toMatchObject({ bracket: 'enabled', meet: 'available' });
  });

  it('disables Display until an engine is on, and never seeds it orphaned', async () => {
    returnCreated('w3', [m('meet', 'available')]);
    const loc = { current: '' };
    mount(loc);
    fillName();
    setModule('Display', 'On');
    // Turning both engines off takes Display with it — the state the server
    // would reject is never reachable.
    setModule('Meet', 'Off');
    expect(
      within(screen.getByRole('radiogroup', { name: 'Display' })).getByRole('radio', { name: 'Off' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Display' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    create();
    await waitFor(() => expect(apiClient.createTournament).toHaveBeenCalled());
    expect(seedFor(vi.mocked(apiClient.createTournament).mock.calls[0][0])).toMatchObject({
      display: 'available',
    });
  });

  it('sends one atomic create with no follow-up state write', async () => {
    returnCreated('w6', [m('meet', 'enabled')]);
    const loc = { current: '' };
    mount(loc);
    fillName();
    create();
    await waitFor(() => expect(loc.current).toBe('/tournaments/w6/setup/details'));
    expect(apiClient.createTournament).toHaveBeenCalledTimes(1);
    expect(apiClient.putTournamentState).not.toHaveBeenCalled();
  });

  it('falls back to kind-derived modules when the create response omits modules', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w7', kind: 'meet' } as never);
    const loc = { current: '' };
    mount(loc);
    fillName();
    create();
    await waitFor(() => expect(loc.current).toBe('/tournaments/w7/setup/details'));
  });

  it('surfaces a create failure without navigating', async () => {
    vi.mocked(apiClient.createTournament).mockRejectedValue(new Error('server said no'));
    const loc = { current: '' };
    mount(loc);
    fillName();
    create();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server said no'));
    expect(loc.current).toBe('/new');
  });
});
