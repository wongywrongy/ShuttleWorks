import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductOutlet } from '../ProductOutlet';
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

function setTabAndKind(tab: string, kind: 'meet' | 'bracket' | null) {
  useUiStore.getState().setActiveTab(tab as never);
  useUiStore.getState().setActiveTournamentKind(kind);
}

describe('ProductOutlet', () => {
  beforeEach(() => setTabAndKind('setup', 'meet'));

  it('renders MeetProduct for a meet operator tab', () => {
    setTabAndKind('schedule', 'meet');
    render(<ProductOutlet />);
    expect(screen.getByTestId('meet-product')).toBeInTheDocument();
  });

  it('renders DisplayProduct for the tv tab', () => {
    setTabAndKind('tv', 'meet');
    render(<ProductOutlet />);
    expect(screen.getByTestId('display-product')).toBeInTheDocument();
  });

  it('renders BracketProduct for a bracket tab', () => {
    setTabAndKind('bracket-draw', 'bracket');
    render(<ProductOutlet />);
    expect(screen.getByTestId('bracket-product')).toBeInTheDocument();
  });
});
