/**
 * Tests for BracketDataSection — the 'Tournament data' section inside
 * bracket Setup. Three plain <a href download> links to the
 * apiClient.bracketExport*Url builders plus the destructive "Reset
 * bracket" action (moved here from the per-view header), wrapped in
 * SettingsPrimitives chrome.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketDataSection } from '../../features/bracket/BracketDataSection';

vi.mock('../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't1',
}));
vi.mock('../../api/bracketClient', () => ({
  useBracketApi: () => ({ remove: vi.fn() }),
}));
vi.mock('../../hooks/useBracket', () => ({
  useBracket: () => ({ setData: vi.fn() }),
}));

describe('<BracketDataSection />', () => {
  it('renders three Export buttons with the correct hrefs', () => {
    render(<BracketDataSection />);
    const json = screen.getByRole('link', { name: /export json/i });
    const csv = screen.getByRole('link', { name: /export csv/i });
    const ics = screen.getByRole('link', { name: /export ics/i });
    expect(json.getAttribute('href')).toMatch(/\/t1\/.*\.json/i);
    expect(csv.getAttribute('href')).toMatch(/\/t1\/.*\.csv/i);
    expect(ics.getAttribute('href')).toMatch(/\/t1\/.*\.ics/i);
  });

  it('renders a section header', () => {
    render(<BracketDataSection />);
    expect(screen.getByText(/^Export$/i)).toBeInTheDocument();
  });

  it('renders the Reset bracket action in the danger zone', () => {
    render(<BracketDataSection />);
    expect(screen.getByText(/danger zone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset bracket/i })).toBeInTheDocument();
  });
});
