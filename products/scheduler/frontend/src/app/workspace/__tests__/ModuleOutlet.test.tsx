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

function setTabAndKind(tab: string, kind: 'meet' | 'bracket' | null) {
  useUiStore.getState().setActiveTab(tab as never);
  useUiStore.getState().setActiveTournamentKind(kind);
}

describe('ModuleOutlet', () => {
  beforeEach(() => setTabAndKind('setup', 'meet'));

  it('renders MeetProduct for a meet operator tab', () => {
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet />);
    expect(screen.getByTestId('meet-product')).toBeInTheDocument();
  });

  it('renders DisplayProduct for the tv tab', () => {
    setTabAndKind('tv', 'meet');
    render(<ModuleOutlet />);
    expect(screen.getByTestId('display-product')).toBeInTheDocument();
  });

  it('renders BracketProduct for a bracket tab', () => {
    setTabAndKind('bracket-draw', 'bracket');
    render(<ModuleOutlet />);
    expect(screen.getByTestId('bracket-product')).toBeInTheDocument();
  });

  // --- Unified Operations (both engines enabled) ---------------------------

  it('single-engine: an operations tab still renders the engine product', () => {
    // Default (bothEnginesEnabled omitted/false) must keep today's behavior.
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet />);
    expect(screen.getByTestId('meet-product')).toBeInTheDocument();
  });

  it('both engines: an operations tab renders the unified OperationsProduct', () => {
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet bothEnginesEnabled />);
    expect(screen.getByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
  });

  it('both engines: the bracket operations tab also renders the unified surface', () => {
    setTabAndKind('bracket-live', 'bracket');
    render(<ModuleOutlet bothEnginesEnabled />);
    expect(screen.getByTestId('operations-product')).toBeInTheDocument();
  });

  it('both engines: a non-operations tab still renders its own engine', () => {
    setTabAndKind('roster', 'meet');
    render(<ModuleOutlet bothEnginesEnabled />);
    expect(screen.getByTestId('meet-product')).toBeInTheDocument();
  });
});
