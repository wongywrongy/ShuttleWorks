import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BracketInlineNotice } from '../BracketInlineNotice';

describe('BracketInlineNotice', () => {
  it('renders an error notice with alert semantics', () => {
    render(
      <BracketInlineNotice
        tone="error"
        title="Bracket failed to load"
        message="Refresh the bracket or check the connection."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Bracket failed to load');
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh the bracket or check the connection.');
  });

  it('renders info notice without alert semantics', () => {
    render(
      <BracketInlineNotice
        tone="info"
        title="Waiting for a draw"
        message="Generate an event to continue."
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for a draw')).toBeInTheDocument();
  });
});
