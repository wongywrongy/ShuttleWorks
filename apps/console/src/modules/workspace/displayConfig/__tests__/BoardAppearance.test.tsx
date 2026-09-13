/**
 * Board content + appearance (operator-visual-fixes P4): the persisted
 * `Show next` / `Show scores` switches and the board's branding — title,
 * logo, banner, accent — behind `GET/PUT /tournaments/{id}/board-settings`.
 *
 * The decisive facts: Next is OFF until the operator turns it on, the whole
 * document round-trips through the API (so a logo survives a reload), and an
 * image is stored as an inline `data:` URI so a venue with no internet still
 * shows it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BoardAppearance } from '../BoardAppearance';
import { apiClient } from '../../../../api/client';
import type { BoardSettingsDTO } from '../../../../api/dto';

const DEFAULTS: BoardSettingsDTO = {
  title: null,
  logoUrl: null,
  bannerUrl: null,
  accent: null,
  showNext: false,
  showScores: true,
};

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.spyOn(apiClient, 'getBoardSettings').mockResolvedValue({ ...DEFAULTS });
  vi.spyOn(apiClient, 'updateBoardSettings').mockImplementation(
    async (_tid: string, body: BoardSettingsDTO) => body,
  );
});

describe('<BoardAppearance />', () => {
  it('shows Next off by default and Scores on', async () => {
    render(<BoardAppearance tid="t1" />);
    const next = await screen.findByRole('switch', { name: 'Show next' });
    expect(next).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Show scores' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('persists the whole document through one explicit save', async () => {
    render(<BoardAppearance tid="t1" />);
    const next = await screen.findByRole('switch', { name: 'Show next' });

    // Nothing is written until Save — a half-typed board setting must not
    // reach the wall.
    fireEvent.click(next);
    expect(apiClient.updateBoardSettings).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Board title'), {
      target: { value: 'Riverside Open' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to board' }));

    await waitFor(() =>
      expect(apiClient.updateBoardSettings).toHaveBeenCalledWith('t1', {
        ...DEFAULTS,
        title: 'Riverside Open',
        showNext: true,
      }),
    );
    // Reloads clean: the saved document is what the controls now reflect.
    await waitFor(() =>
      expect(screen.getByTestId('board-apply-status').textContent).toBe(
        'Saved. The board shows this.',
      ),
    );
  });

  it('offers Replace and Remove for an image the workspace already has', async () => {
    vi.spyOn(apiClient, 'getBoardSettings').mockResolvedValue({
      ...DEFAULTS,
      // An inline data URI: what makes branding work offline, and the only
      // image source the app's own CSP admits besides same-origin.
      logoUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    });
    render(<BoardAppearance tid="t1" />);

    expect(await screen.findByAltText('Logo preview')).toHaveAttribute(
      'src',
      'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to board' }));
    await waitFor(() =>
      expect(apiClient.updateBoardSettings).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ logoUrl: null }),
      ),
    );
  });

  it('says so, and saves nothing, when the settings cannot be loaded', async () => {
    vi.spyOn(apiClient, 'getBoardSettings').mockRejectedValue(new Error('offline'));
    render(<BoardAppearance tid="t1" />);
    expect(await screen.findByText('The board settings could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply to board' })).toBeNull();
  });
});
