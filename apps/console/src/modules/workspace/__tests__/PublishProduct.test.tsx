import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublishProduct, paneFromPath } from '../WorkspaceShellSurface';

vi.mock('../../settings/SharingTab', () => ({
  SharingTab: ({ scope }: { scope: string }) => <div data-testid={`sharing-${scope}`}>sharing {scope}</div>,
}));
vi.mock('../DisplayConfig', () => ({
  DisplayConfig: () => <div data-testid="display-config">display config</div>,
}));

const modules = [{ id: 'display', label: 'Display', status: 'enabled' }] as never[];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublishProduct tid="t1" modules={modules} />
    </MemoryRouter>,
  );
}

describe('PublishProduct', () => {
  it('recognizes each canonical publish pane', () => {
    expect(paneFromPath('/tournaments/t1/publish/site')).toBe('site');
    expect(paneFromPath('/tournaments/t1/publish/draws-results')).toBe('draws-results');
    expect(paneFromPath('/tournaments/t1/publish/displays')).toBe('displays');
    expect(paneFromPath('/tournaments/t1/publish/links')).toBe('links');
    expect(paneFromPath('/tournaments/t1/publish/unknown')).toBe('site');
  });

  it('keeps public-site publication separate from links and embeds', () => {
    renderAt('/tournaments/t1/publish/site');
    expect(screen.getByTestId('sharing-site')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Publish sections' })).toBeNull();
  });

  it('selects the display configuration pane from its canonical path', () => {
    renderAt('/tournaments/t1/publish/displays');
    expect(screen.getByTestId('display-config')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Publish sections' })).toBeNull();
  });

  it('keeps publication checkboxes on Site only (SWP-11)', () => {
    renderAt('/tournaments/t1/publish/draws-results');
    expect(screen.queryByTestId('sharing-site')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Publication toggles live on Site/ })).toHaveAttribute(
      'href',
      '/tournaments/t1/publish/site',
    );
  });
});
