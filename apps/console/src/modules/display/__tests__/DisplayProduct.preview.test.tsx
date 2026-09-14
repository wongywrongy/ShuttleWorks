/** Legacy TV chrome still suppresses operator toasts during route hand-off.
 *  The standalone public board remains outside AppShell. These assertions
 *  exercise ToastStack itself, with the ordinary operator view as control. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastStack } from '../../../components/Toast';
import { useUiStore } from '../../../store/uiStore';
import type { Advisory } from '../../../api/dto';

const CRITICAL_ADVISORY: Advisory = {
  id: 'adv-1',
  kind: 'overrun',
  severity: 'critical',
  summary: 'Match #1 has run 12 min over its expected duration',
  detail: null,
  detectedAt: '2026-07-03T12:00:00Z',
};

const API_ERROR_MESSAGE = 'Failed to save schedule';

afterEach(() => {
  useUiStore.getState().reset();
});

describe('legacy TV chrome', () => {
  it('shows neither an operator API-error toast nor an advisory-as-toast', async () => {
    useUiStore.setState({ activeTab: 'tv' });
    useUiStore.getState().setAdvisories([CRITICAL_ADVISORY]);
    useUiStore.getState().pushToast({ level: 'error', message: API_ERROR_MESSAGE, detail: 'Network error' });
    // Mirrors what useAdvisories would push for a fresh critical advisory
    // (severity 'critical' -> toast level 'error'; see hooks/useAdvisories.ts).
    useUiStore.getState().pushToast({ level: 'error', message: CRITICAL_ADVISORY.summary });

    render(<ToastStack />);

    expect(screen.queryByTestId('toast-stack')).toBeNull();
    expect(screen.queryByText(API_ERROR_MESSAGE)).toBeNull();
    expect(screen.queryByText(CRITICAL_ADVISORY.summary)).toBeNull();
  });

  it('positive control: an operator segment (Schedule) still shows the toast', () => {
    useUiStore.setState({ activeTab: 'schedule' });
    useUiStore.getState().pushToast({ level: 'error', message: API_ERROR_MESSAGE });

    render(<ToastStack />);

    expect(screen.getByTestId('toast-stack')).toBeInTheDocument();
    expect(screen.getByText(API_ERROR_MESSAGE)).toBeInTheDocument();
  });
});
