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
    setTabAndKind('schedule', 'meet');
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

  // --- Unified Operations (both engines enabled) ---------------------------

  it('single-engine: an operations tab still renders the engine product', async () => {
    // Default (bothEnginesEnabled omitted/false) must keep today's behavior.
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('meet-product')).toBeInTheDocument();
  });

  it('both engines: an operations tab renders the unified OperationsProduct', async () => {
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet bothEnginesEnabled />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
  });

  it('both engines: the bracket operations tab also renders the unified surface', async () => {
    setTabAndKind('bracket-live', 'bracket');
    render(<ModuleOutlet bothEnginesEnabled />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
  });

  it('both engines: a non-operations tab still renders its own engine', async () => {
    setTabAndKind('roster', 'meet');
    render(<ModuleOutlet bothEnginesEnabled />);
    expect(await screen.findByTestId('meet-product')).toBeInTheDocument();
  });
});
