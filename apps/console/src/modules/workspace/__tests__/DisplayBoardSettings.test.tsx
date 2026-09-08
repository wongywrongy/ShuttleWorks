import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DisplayBoardSettings } from '../WorkspaceShellSurface';

vi.mock('../../settings/SharingTab', () => ({
  SharingTab: ({ scope }: { scope: string }) => <div data-testid={`sharing-${scope}`}>sharing {scope}</div>,
}));
vi.mock('../DisplayConfig', () => ({
  // The link controls are composed INTO the board settings now, under the
  // on/off switch — the page passes them in as `linkSlot`.
  DisplayConfig: ({ linkSlot }: { linkSlot?: React.ReactNode }) => (
    <div data-testid="display-config">display config{linkSlot}</div>
  ),
}));

const modules = [{ id: 'display', label: 'Display', status: 'enabled' }] as never[];

describe('Display · Board', () => {
  it('puts board configuration and the board link on one page', () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/t1/display/board']}>
        <DisplayBoardSettings tid="t1" modules={modules} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('display-config')).toBeInTheDocument();
    expect(screen.getByTestId('sharing-links')).toBeInTheDocument();
    // Publication of the public SITE is not a board setting — it lives with
    // the public content it governs, in Setup · Public site.
    expect(screen.queryByTestId('sharing-site')).toBeNull();
  });

  // OPR-0908-4: one heading owner. The page's `ActionsBar` names the board
  // exactly once; neither `DisplayConfig` nor `SharingTab` (scope="links")
  // repeats it.
  it('names the board exactly once — the page owns the title', () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/t1/display/board']}>
        <DisplayBoardSettings tid="t1" modules={modules} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Venue board')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Venue board', level: 2 })).toBeVisible();
  });
});
