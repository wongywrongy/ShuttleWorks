/**
 * An invalid (or revoked) display link must READ as broken.
 *
 * Before this test the board sat on "Waiting to connect…" forever while
 * re-404ing /state and /match-states every poll cycle — a venue TV that looks
 * like it is about to recover but never can (2026-08-10 browser pass).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeetDisplayPage } from '../MeetDisplayPage';
import { apiClient } from '../../../api/client';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useUiStore } from '../../../store/uiStore';

const notFound = () => Object.assign(new Error('Tournament not found'), { status: 404 });

function renderBoard(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MeetDisplayPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  useTournamentStore.getState().reset();
  useUiStore.getState().reset();
});

describe('MeetDisplayPage — invalid display link', () => {
  it('says the link is not valid instead of waiting forever', async () => {
    vi.spyOn(apiClient, 'getDisplayState').mockRejectedValue(notFound());
    vi.spyOn(apiClient, 'getDisplayMatchStates').mockRejectedValue(notFound());

    renderBoard('/display?token=bad-token');

    await waitFor(() => expect(screen.getByTestId('display-link-invalid')).toBeInTheDocument());
    expect(screen.queryByText(/waiting to connect/i)).toBeNull();
    // The freshness pill would read "Delayed", implying a recoverable blip.
    expect(screen.queryByText(/delayed/i)).toBeNull();
  });

  it('a workspace with no schedule yet still reads as connecting, not broken', async () => {
    vi.spyOn(apiClient, 'getDisplayState').mockResolvedValue(null as never);
    vi.spyOn(apiClient, 'getDisplayMatchStates').mockResolvedValue({} as never);

    renderBoard('/display?token=good-token');

    await waitFor(() =>
      expect(screen.getByText(/no schedule generated yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('display-link-invalid')).toBeNull();
  });
});
