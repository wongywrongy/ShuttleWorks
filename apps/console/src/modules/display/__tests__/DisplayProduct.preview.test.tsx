/**
 * The in-shell `/tv` preview (`DisplayProduct`) embeds the public board
 * inside the normal AppShell module outlet — but AppShell mounts
 * `<ToastStack />` as a root-level sibling of the workspace shell (see
 * `app/AppShell.tsx`), covering EVERY segment including `tv`. Operator
 * API-error toasts and advisory-as-toast (`useAdvisories` → `pushToast`,
 * see `hooks/useAdvisories.ts`) would otherwise float over the preview —
 * the audit's problem-#1 source. The preview must faithfully mirror the
 * standalone `/display` board, which never has `ToastStack` mounted at
 * all (it lives outside AppShell — see `app/App.tsx`).
 *
 * `SolverHud` already suppresses itself on the `tv` tab the same way
 * (`if (activeTab === 'tv') return null;` in `components/SolverHud.tsx`)
 * — this test proves `ToastStack` gets the same treatment, and (as a
 * positive control) that a non-Display segment is untouched.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DisplayProduct } from '../DisplayProduct';
import { ToastStack } from '../../../components/Toast';
import { useUiStore } from '../../../store/uiStore';
import type { Advisory } from '../../../api/dto';

// The embedded public display is heavy + starts its own polling; stub it
// so this test focuses on the chrome around it (DisplayProduct's wrapper
// + the AppShell-level ToastStack sibling), matching DisplayProduct.test.tsx.
vi.mock('../PublicDisplayPage', () => ({
  PublicDisplayPage: () => <div data-testid="public-display" />,
}));

const CRITICAL_ADVISORY: Advisory = {
  id: 'adv-1',
  kind: 'overrun',
  severity: 'critical',
  summary: 'Match #1 has run 12 min over its expected duration',
  detail: null,
  detectedAt: '2026-07-03T12:00:00Z',
};

const API_ERROR_MESSAGE = 'Failed to save schedule';

function renderTvPreview() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/abc123/tv']}>
      <Routes>
        <Route
          path="/tournaments/:id/tv"
          element={
            // Mirrors AppShell's actual structure: ToastStack is a root
            // sibling of the routed module content, not a child of it.
            <>
              <DisplayProduct />
              <ToastStack />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  useUiStore.getState().reset();
});

describe('DisplayProduct /tv preview — mirrors the public board', () => {
  it('shows neither an operator API-error toast nor an advisory-as-toast', async () => {
    useUiStore.setState({ activeTab: 'tv' });
    useUiStore.getState().setAdvisories([CRITICAL_ADVISORY]);
    useUiStore.getState().pushToast({ level: 'error', message: API_ERROR_MESSAGE, detail: 'Network error' });
    // Mirrors what useAdvisories would push for a fresh critical advisory
    // (severity 'critical' -> toast level 'error'; see hooks/useAdvisories.ts).
    useUiStore.getState().pushToast({ level: 'error', message: CRITICAL_ADVISORY.summary });

    renderTvPreview();
    await screen.findByTestId('public-display');

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
