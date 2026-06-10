import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BracketEmptyState } from '../../features/bracket/BracketEmptyState';

describe('BracketEmptyState', () => {
  it('renders title, body, and primary action when provided', () => {
    render(
      <BracketEmptyState
        eyebrow="Draw"
        title="No draws generated"
        body="Add participants and generate an event before opening the draw."
        actionLabel="Go to Events"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No draws generated' })).toBeInTheDocument();
    expect(screen.getByText('Add participants and generate an event before opening the draw.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Events' })).toBeInTheDocument();
  });

  it('omits the action button when no action is provided', () => {
    render(
      <BracketEmptyState
        eyebrow="Live"
        title="No live matches"
        body="Scheduled matches will appear here when play begins."
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
