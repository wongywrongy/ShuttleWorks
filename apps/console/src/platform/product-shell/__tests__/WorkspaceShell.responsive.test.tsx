/**
 * The workspace shell has a responsive story (2026-08-11 design audit, T4).
 *
 * The rail was `w-56 shrink-0` with no breakpoint anywhere in the shell, so at
 * a 390px viewport the global rail (56px) + workspace rail (224px) left the
 * surface ~110px — measured independently by three audit agents. The owner has
 * ruled a desk may run a tablet, so that is a ship blocker.
 *
 * These assert BEHAVIOUR, not class strings: at a narrow viewport the nav is
 * reachable through a trigger, and it hands the width back to the surface.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceShell, SHELL_RAIL_MIN_WIDTH } from '../WorkspaceShell';
import type { WorkspaceIdentity } from '../types';
import { modulesForWorkspace } from '../../domain/moduleModel';

const identity: WorkspaceIdentity = {
  name: 'Spring Finals',
  date: '2026-04-01',
  status: 'active',
  kind: 'meet',
};

const base = {
  modules: modulesForWorkspace('meet'),
  tid: 't1',
  kind: 'meet' as const,
  activeTab: 'overview' as const,
  adminActive: false,
  onOpenAdmin: () => {},
  onBackToHub: () => {},
};

const DEFAULT_WIDTH = window.innerWidth;

/** Set the viewport width the way a real resize does — the shell listens. */
function setViewport(px: number) {
  act(() => {
    window.innerWidth = px;
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  window.innerWidth = DEFAULT_WIDTH;
});

function renderShell() {
  return render(
    <MemoryRouter>
      <WorkspaceShell identity={identity} {...base}>
        <div data-testid="content">content</div>
      </WorkspaceShell>
    </MemoryRouter>,
  );
}

describe('WorkspaceShell — narrow viewports', () => {
  it('gives the surface the full width and puts the nav behind a trigger', async () => {
    window.innerWidth = 390;
    renderShell();

    // The rail no longer holds 224px of a 390px viewport…
    expect(screen.queryByTestId('ws-nav-overview')).toBeNull();
    // …and the nav it held is one labelled control away.
    const trigger = screen.getByRole('button', { name: /workspace sections/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);

    // A real dialog: named, modal, and carrying the same nav destinations.
    const drawer = screen.getByRole('dialog');
    expect(drawer).toHaveAccessibleName(/workspace sections/i);
    expect(screen.getByTestId('ws-nav-overview')).toBeInTheDocument();
    expect(screen.getByTestId('ws-nav-administration-modules')).toBeInTheDocument();
  });

  it('closes itself once it has navigated — the drawer is not left over the surface', async () => {
    window.innerWidth = 390;
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /workspace sections/i }));
    await userEvent.click(screen.getByTestId('ws-nav-administration-modules'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismisses on Escape and restores focus to the trigger', async () => {
    window.innerWidth = 390;
    renderShell();
    const trigger = screen.getByRole('button', { name: /workspace sections/i });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('hands the rail back when the viewport widens past the breakpoint', () => {
    window.innerWidth = 390;
    renderShell();
    expect(screen.queryByTestId('ws-nav-overview')).toBeNull();

    setViewport(SHELL_RAIL_MIN_WIDTH);

    expect(screen.getByTestId('ws-nav-overview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /workspace sections/i })).toBeNull();
  });

  it('NEGATIVE CONTROL: a wide viewport keeps the persistent rail and shows no trigger', () => {
    window.innerWidth = 1440;
    renderShell();
    expect(screen.getByTestId('ws-nav-overview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /workspace sections/i })).toBeNull();
  });
});

describe('WorkspaceShell — one nav, not two', () => {
  it('never renders the nav twice (a hidden duplicate is a duplicate landmark)', async () => {
    window.innerWidth = 390;
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /workspace sections/i }));
    expect(screen.getAllByRole('navigation', { name: 'Workspace' })).toHaveLength(1);
    // getByTestId throws on duplicates — this is the assertion that a
    // `hidden md:flex` rail + drawer pair would fail.
    expect(() => screen.getByTestId('ws-nav-overview')).not.toThrow();
  });
});

// Guard against the hook itself regressing to a media query: jsdom's
// matchMedia always reports `matches: false`, which would silently pin the
// shell to its narrow layout in every other test in this suite.
it('sanity: the default jsdom viewport is a wide one', () => {
  expect(DEFAULT_WIDTH).toBeGreaterThanOrEqual(SHELL_RAIL_MIN_WIDTH);
  expect(vi.isMockFunction(window.matchMedia)).toBe(false);
});
