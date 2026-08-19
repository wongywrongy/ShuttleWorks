import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleUnavailablePanel } from '../ModuleUnavailablePanel';

describe('ModuleUnavailablePanel', () => {
  it('shows the label + note and calls onGoToPrimary', () => {
    const onGo = vi.fn();
    render(
      <ModuleUnavailablePanel
        label="Bracket"
        note="Bracket is not enabled for this workspace yet."
        primaryLabel="Meet"
        onGoToPrimary={onGo}
      />,
    );
    expect(screen.getByTestId('module-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/isn.t available in this workspace/)).toBeInTheDocument();
    expect(screen.getByText(/not enabled for this workspace yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Go to Meet/ }));
    expect(onGo).toHaveBeenCalled();
  });

  it('shows Open Settings only when onOpenSettings is provided', () => {
    const { rerender } = render(
      <ModuleUnavailablePanel label="Display" primaryLabel="Meet" onGoToPrimary={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /Open Settings/ })).toBeNull();
    const onSettings = vi.fn();
    rerender(
      <ModuleUnavailablePanel
        label="Display"
        primaryLabel="Meet"
        onGoToPrimary={() => {}}
        onOpenSettings={onSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open Settings/ }));
    expect(onSettings).toHaveBeenCalled();
  });
});
