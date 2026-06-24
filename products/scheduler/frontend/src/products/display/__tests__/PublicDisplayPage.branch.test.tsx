import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicDisplayPage } from '../PublicDisplayPage';

// Stub the kind resolver + the two heavy display pages so the test focuses on
// the routing decision only.
const mockKind = vi.fn();
vi.mock('../useDisplayKind', () => ({ useDisplayKind: () => mockKind() }));
vi.mock('../MeetDisplayPage', () => ({
  MeetDisplayPage: () => <div data-testid="meet-display" />,
}));
vi.mock('../bracketDisplay/BracketDisplayPage', () => ({
  BracketDisplayPage: () => <div data-testid="bracket-display" />,
}));

function renderRouter() {
  return render(
    <MemoryRouter initialEntries={['/display?id=t1']}>
      <PublicDisplayPage />
    </MemoryRouter>,
  );
}

describe('PublicDisplayPage kind-router', () => {
  it('renders the bracket display for a bracket workspace', async () => {
    mockKind.mockReturnValue('bracket');
    renderRouter();
    await waitFor(() => expect(screen.getByTestId('bracket-display')).toBeInTheDocument());
    expect(screen.queryByTestId('meet-display')).toBeNull();
  });

  it('renders the meet display for a meet workspace (and while loading)', () => {
    mockKind.mockReturnValue('meet');
    renderRouter();
    expect(screen.getByTestId('meet-display')).toBeInTheDocument();
    expect(screen.queryByTestId('bracket-display')).toBeNull();
  });

  it('defaults to the meet display while kind is null (loading)', () => {
    mockKind.mockReturnValue(null);
    renderRouter();
    expect(screen.getByTestId('meet-display')).toBeInTheDocument();
  });
});
