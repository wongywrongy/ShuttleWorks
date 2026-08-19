import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModuleOutlet } from '../ModuleOutlet';
import { useUiStore } from '../../../store/uiStore';

vi.mock('../../../products/meet/MeetProduct', () => ({
  MeetProduct: () => <div data-testid="meet-product" />,
}));
vi.mock('../../../products/bracket/BracketProduct', () => ({
  BracketProduct: () => <div data-testid="bracket-product" />,
}));
vi.mock('../../../products/display/DisplayProduct', () => ({
  DisplayProduct: () => <div data-testid="display-product" />,
}));
vi.mock('../../../products/operations/OperationsProduct', () => ({
  OperationsProduct: () => <div data-testid="operations-product" />,
}));
vi.mock('../../../products/entries/EntriesProduct', () => ({
  EntriesProduct: () => <div data-testid="entries-product" />,
}));

function setTabAndKind(tab: string, kind: 'meet' | 'bracket' | null) {
  useUiStore.getState().setActiveTab(tab as never);
  useUiStore.getState().setActiveTournamentKind(kind);
}

describe('ModuleOutlet', () => {
  beforeEach(() => setTabAndKind('setup', 'meet'));

  // Products are lazy()-loaded behind Suspense (PERF_FINDINGS FIX A), so
  // the mounted product appears asynchronously — assert with findByTestId.
  it('renders MeetProduct for a meet operator tab', async () => {
    // A non-Operations meet tab: since the B3 flip, 'schedule'/'live' route
    // to the unified Operations surface (covered below).
    setTabAndKind('roster', 'meet');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('meet-product')).toBeInTheDocument();
  });

  it('renders DisplayProduct for the tv tab', async () => {
    setTabAndKind('tv', 'meet');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('display-product')).toBeInTheDocument();
  });

  it('renders BracketProduct for a bracket tab', async () => {
    setTabAndKind('bracket-draw', 'bracket');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('bracket-product')).toBeInTheDocument();
  });

  it('renders EntriesProduct for the entries tab, on either kind', async () => {
    // The outlet's final `else` is MeetProduct, so an unrouted module id
    // renders the Meet product under someone else's URL — this is the
    // assertion that catches that, and the AppShell guard is what catches it
    // for a module this workspace does not have at all.
    setTabAndKind('entries', 'bracket');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('entries-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bracket-product')).not.toBeInTheDocument();
  });

  // --- Unified Operations (SP-CONSOLE-4 B3 flip) ---------------------------
  // Every Operations segment routes to OperationsProduct regardless of how
  // many engines the workspace runs; `engines` only shapes its actions.

  it('single-engine meet: an operations tab renders the unified OperationsProduct', async () => {
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet engines={{ meet: true, bracket: false }} />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
  });

  it('single-engine bracket: the bracket operations tab renders the unified surface', async () => {
    setTabAndKind('bracket-live', 'bracket');
    render(<ModuleOutlet engines={{ meet: false, bracket: true }} />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('bracket-product')).not.toBeInTheDocument();
  });

  it('both engines: an operations tab renders the unified OperationsProduct', async () => {
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet engines={{ meet: true, bracket: true }} />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
  });

  it('a non-operations tab still renders its own engine', async () => {
    setTabAndKind('roster', 'meet');
    render(<ModuleOutlet engines={{ meet: true, bracket: true }} />);
    expect(await screen.findByTestId('meet-product')).toBeInTheDocument();
  });

});
