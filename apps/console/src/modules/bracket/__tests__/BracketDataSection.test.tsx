/**
 * Tests for BracketDataSection — the 'Tournament data' section inside
 * bracket Setup. Three Export buttons that fetch through
 * apiClient.downloadBracketExport (so a stale session asks to verify and
 * the download resumes, rather than a link opening a raw 401) plus the
 * destructive "Reset bracket" action, wrapped in SettingsPrimitives chrome.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BracketDataSection } from '../BracketDataSection';
import { apiClient } from '../../../api/client';

vi.mock('../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't1',
}));
vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({ remove: vi.fn() }),
}));
vi.mock('../../../api/client', () => ({
  apiClient: { downloadBracketExport: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../../../hooks/useBracket', () => ({
  useBracket: () => ({ setData: vi.fn() }),
}));

describe('<BracketDataSection />', () => {
  it('each Export button downloads its format for this workspace', async () => {
    const interact = userEvent.setup();
    render(<BracketDataSection />);
    for (const [name, format] of [['json', 'json'], ['csv', 'csv'], ['ics', 'ics']] as const) {
      await interact.click(screen.getByRole('button', { name: new RegExp(`export ${name}`, 'i') }));
      expect(apiClient.downloadBracketExport).toHaveBeenLastCalledWith('t1', format);
    }
    expect(screen.queryByRole('link', { name: /export/i })).not.toBeInTheDocument();
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
