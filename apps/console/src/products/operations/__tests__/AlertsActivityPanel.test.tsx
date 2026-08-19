import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AlertsActivityPanel } from '../run/AlertsActivityPanel';
import { AdvisoryBanner } from '../../../components/status/AdvisoryBanner';
import { useAlertStore } from '../../../store/alertStore';
import { useUiStore } from '../../../store/uiStore';
import type { Advisory } from '../../../api/dto';

function adv(p: Partial<Advisory> & Pick<Advisory, 'id' | 'severity'>): Advisory {
  return {
    kind: 'running_behind',
    summary: `${p.id} summary`,
    detail: null,
    matchId: null,
    courtId: null,
    suggestedAction: null,
    suggestionId: null,
    detectedAt: '2026-07-10T09:00:00.000Z',
    ...p,
  };
}

describe('AlertsActivityPanel', () => {
  beforeEach(() => useAlertStore.getState().reset());

  it('shows a quiet placeholder when empty', () => {
    render(<AlertsActivityPanel />);
    expect(screen.getByText(/no alerts or activity yet/i)).toBeInTheDocument();
  });

  it('renders warning conditions with a count chip and a Review action', () => {
    useAlertStore.getState().syncAdvisories([
      adv({ id: 'late', severity: 'warn', suggestedAction: { kind: 'repair', payload: {} } }),
    ]);
    const onReview = vi.fn();
    render(<AlertsActivityPanel onReview={onReview} />);
    expect(screen.getByText('late summary')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // count chip
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it('collapses to the count chip without hiding the count', () => {
    useAlertStore.getState().syncAdvisories([adv({ id: 'w', severity: 'warn' })]);
    render(<AlertsActivityPanel />);
    expect(screen.getByText('w summary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /alerts and activity/i }));
    expect(screen.queryByText('w summary')).not.toBeInTheDocument(); // list hidden
    expect(screen.getByText('1')).toBeInTheDocument(); // count still shown
  });

  // CMP-4 (SP-CONSOLE-4 C4): the Run mount starts collapsed while empty and
  // auto-expands when the first entry arrives; an operator toggle wins.
  it('collapseWhenEmpty: header-only while empty, auto-expands on the first entry', () => {
    render(<AlertsActivityPanel collapseWhenEmpty />);
    expect(screen.queryByText(/no alerts or activity yet/i)).not.toBeInTheDocument();

    act(() => useAlertStore.getState().syncAdvisories([adv({ id: 'w', severity: 'warn' })]));
    expect(screen.getByText('w summary')).toBeInTheDocument();
  });

  it('collapseWhenEmpty: an explicit expand pins the panel open even while empty', () => {
    render(<AlertsActivityPanel collapseWhenEmpty />);
    fireEvent.click(screen.getByRole('button', { name: /alerts and activity/i }));
    expect(screen.getByText(/no alerts or activity yet/i)).toBeInTheDocument();
  });
});

describe('AdvisoryBanner (decision-only)', () => {
  beforeEach(() => useUiStore.getState().setAdvisories([]));

  it('renders nothing when there are no decisions', () => {
    useUiStore.getState().setAdvisories([adv({ id: 'w', severity: 'warn' })]);
    const { container } = render(<AdvisoryBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the top critical decision with Review + a +N queue count', () => {
    useUiStore.getState().setAdvisories([
      adv({ id: 'c1', severity: 'critical', suggestedAction: { kind: 'warm_restart', payload: {} }, detectedAt: '2026-07-10T10:00:00Z' }),
      adv({ id: 'c2', severity: 'critical', detectedAt: '2026-07-10T09:00:00Z' }),
    ]);
    const onReview = vi.fn();
    render(<AdvisoryBanner onReview={onReview} />);
    expect(screen.getByText('c1 summary')).toBeInTheDocument(); // newest decision
    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(onReview).toHaveBeenCalledOnce();
  });
});
