/**
 * Tests for BracketDataSection — the 'Tournament data' section inside
 * bracket Setup. Bundle 5 ships exports-only (no import/backup/reset);
 * three plain <a href download> links to the apiClient.bracketExport*Url
 * builders, wrapped in SettingsPrimitives chrome.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketDataSection } from '../../features/bracket/BracketDataSection';

vi.mock('../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't1',
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
});
