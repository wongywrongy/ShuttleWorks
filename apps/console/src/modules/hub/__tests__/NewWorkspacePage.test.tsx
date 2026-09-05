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

/** Toggle the remaining independently selectable module. */
function setModule(label: string, state: 'On' | 'Off') {
  const group = screen.getByRole('radiogroup', { name: label });
  fireEvent.click(within(group).getByRole('radio', { name: state }));
}

function advanceToReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
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

  it('starts with type and module choices, with no preset templates', () => {
    mount({ current: '' });
    expect(screen.getByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    expect(screen.getAllByText('Meet').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bracket').length).toBeGreaterThan(0);
    expect(screen.getByRole('radiogroup', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Tournament type' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Courts')).toBeNull();
    // The presets are gone, not merely relabelled.
    for (const gone of [/Meet Day/i, /Bracket Tournament/i, /Hybrid Event/i, /Blank Workspace/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('defaults to Meet as the single engine choice', () => {
    mount({ current: '' });
    expect(within(screen.getByRole('radiogroup', { name: 'Tournament type' })).getByRole('radio', { name: 'Meet' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sends the chosen modules and derives kind=meet', async () => {
    returnCreated('w1', [m('meet', 'enabled'), m('bracket', 'available'), m('display', 'enabled')]);
    const loc = { current: '' };
    mount(loc);
    setModule('Display', 'On');
    advanceToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w1/overview'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('meet');
    // Off seeds as `available`, not `disabled` (R-B): at creation the two
    // said the same thing, so the form stopped asking.
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
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tournament type' })).getByRole('radio', { name: 'Bracket' }));
    advanceToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w2/overview'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('bracket');
    expect(seedFor(body)).toMatchObject({ bracket: 'enabled', meet: 'available' });
  });

  it('always includes one engine because tournament type owns engine selection', () => {
    mount({ current: '' });
    expect(screen.queryByTestId('modules-hint')).toBeNull();
    expect(screen.getByText(/Included by tournament type/i)).toBeInTheDocument();
  });

  it('allows Display to be turned on independently', () => {
    mount({ current: '' });
    setModule('Display', 'On');
    expect(within(screen.getByRole('radiogroup', { name: 'Display' })).getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'true');
  });

  it('seeds the court count in the atomic create request', async () => {
    returnCreated('w5', [m('meet', 'enabled')]);
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Courts'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w5/overview'));
    expect(vi.mocked(apiClient.createTournament).mock.calls[0][0].courtCount).toBe(9);
    expect(apiClient.putTournamentState).not.toHaveBeenCalled();
  });

  it('does not perform a follow-up state write after creation', async () => {
    returnCreated('w6', [m('meet', 'enabled')]);
    const loc = { current: '' };
    mount(loc);
    advanceToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w6/overview'));
    expect(apiClient.putTournamentState).not.toHaveBeenCalled();
  });

  it('falls back to kind-derived modules when the create response omits modules', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w7', kind: 'meet' } as never);
    const loc = { current: '' };
    mount(loc);
    advanceToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w7/overview'));
  });

  it('surfaces a create failure without navigating', async () => {
    vi.mocked(apiClient.createTournament).mockRejectedValue(new Error('server said no'));
    const loc = { current: '' };
    mount(loc);
    advanceToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server said no'));
    expect(loc.current).toBe('/new');
  });
});
