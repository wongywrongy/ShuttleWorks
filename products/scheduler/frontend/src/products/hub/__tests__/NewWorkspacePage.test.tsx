/**
 * `/new` has NO PRESETS. The director picks modules and states the courts.
 *
 * These used to drive four template cards plus a Custom escape hatch. The
 * routing behaviour they pinned (land per the RETURNED modules, kind derived
 * from the seed, nothing-enabled goes to Modules) is unchanged and still
 * covered — it is only reached by choosing modules directly now.
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

/** Set a module's tri-state via its radiogroup, the way an operator does. */
function setModule(label: string, state: 'On' | 'Available' | 'Off') {
  const group = screen.getByRole('radiogroup', { name: label });
  fireEvent.click(within(group).getByRole('radio', { name: state }));
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

  it('offers modules and courts directly, with no preset templates', () => {
    mount({ current: '' });
    expect(screen.getByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    for (const label of ['Meet', 'Bracket', 'Display']) {
      expect(screen.getByRole('radiogroup', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Courts')).toBeInTheDocument();
    // The presets are gone, not merely relabelled.
    for (const gone of [/Meet Day/i, /Bracket Tournament/i, /Hybrid Event/i, /Blank Workspace/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('defaults to Meet on, so the common case is one click to create', () => {
    mount({ current: '' });
    const meet = screen.getByRole('radiogroup', { name: 'Meet' });
    expect(within(meet).getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sends the chosen modules and derives kind=meet', async () => {
    returnCreated('w1', [m('meet', 'enabled'), m('bracket', 'available'), m('display', 'enabled')]);
    const loc = { current: '' };
    mount(loc);
    setModule('Bracket', 'Available');
    setModule('Display', 'On');
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w1/overview'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('meet');
    expect(seedFor(body)).toMatchObject({
      meet: 'enabled',
      bracket: 'available',
      display: 'enabled',
    });
  });

  it('derives kind=bracket when bracket is the only engine on', async () => {
    returnCreated('w2', [m('bracket', 'enabled'), m('meet', 'disabled'), m('display', 'disabled')]);
    const loc = { current: '' };
    mount(loc);
    setModule('Meet', 'Off');
    setModule('Bracket', 'On');
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w2/overview'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('bracket');
    expect(seedFor(body)).toMatchObject({ bracket: 'enabled', meet: 'disabled' });
  });

  it('routes to Modules when nothing is enabled, and warns first', async () => {
    returnCreated('w4', [m('meet', 'available'), m('bracket', 'available'), m('display', 'disabled')]);
    const loc = { current: '' };
    mount(loc);
    setModule('Meet', 'Available');
    // Warn, never block — the state is recoverable from Modules.
    expect(screen.getByTestId('modules-hint')).toHaveTextContent(/opens on Modules/i);
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w4/ws-modules'));
  });

  it('warns when Display has no engine to show', () => {
    mount({ current: '' });
    setModule('Meet', 'Off');
    setModule('Display', 'On');
    expect(screen.getByTestId('modules-hint')).toHaveTextContent(/Display needs Meet or Bracket/i);
  });

  it('seeds the court count through a follow-up state write', async () => {
    returnCreated('w5', [m('meet', 'enabled')]);
    vi.mocked(apiClient.getTournamentState).mockResolvedValue({
      config: { courtCount: 2 },
    } as never);
    const loc = { current: '' };
    mount(loc);
    fireEvent.change(screen.getByLabelText('Courts'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w5/overview'));
    const [, state] = vi.mocked(apiClient.putTournamentState).mock.calls[0];
    expect((state as { config: { courtCount: number } }).config.courtCount).toBe(9);
  });

  it('still creates the workspace when the court write fails', async () => {
    // The director already committed to creating it; losing the workspace over
    // a court count that Venue & schedule can fix is the worse outcome.
    returnCreated('w6', [m('meet', 'enabled')]);
    vi.mocked(apiClient.getTournamentState).mockRejectedValue(new Error('boom'));
    const loc = { current: '' };
    mount(loc);
    fireEvent.change(screen.getByLabelText('Courts'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w6/overview'));
  });

  it('falls back to kind-derived modules when the create response omits modules', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w7', kind: 'meet' } as never);
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w7/overview'));
  });

  it('surfaces a create failure without navigating', async () => {
    vi.mocked(apiClient.createTournament).mockRejectedValue(new Error('server said no'));
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server said no'));
    expect(loc.current).toBe('/new');
  });
});
