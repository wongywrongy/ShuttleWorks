import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityTab } from '../ActivityTab';
import { useAlertStore } from '../../../store/alertStore';

describe('ActivityTab', () => {
  beforeEach(() => useAlertStore.getState().reset());

  it('distinguishes durable tournament history from current-session observations', () => {
    render(<ActivityTab />);
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tournament history' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current browser session' })).toBeInTheDocument();
    expect(screen.getByText(/Server-recorded changes identify who changed what and when/i)).toBeInTheDocument();
  });

  it('renders observed entries with exact timestamps', () => {
    useAlertStore.getState().logActivity({
      id: 'activity-1',
      severity: 'info',
      ts: '2026-08-29T12:34:56Z',
      title: 'Match M12',
      message: 'score recorded',
      source: 'activity',
    });
    render(<ActivityTab />);
    expect(screen.getByTestId('session-activity-list')).toHaveTextContent('Match M12');
    expect(screen.getByText('score recorded')).toBeInTheDocument();
    expect(screen.getByTestId('activity-timestamp')).toHaveAttribute('datetime', '2026-08-29T12:34:56Z');
  });
});
