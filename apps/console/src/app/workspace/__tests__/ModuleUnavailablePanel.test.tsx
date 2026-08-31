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

  it('explains a stable guard reason and exposes permission resolution', () => {
    const onRequest = vi.fn();
    render(
      <ModuleUnavailablePanel
        label="Display"
        primaryLabel="Meet"
        onGoToPrimary={() => {}}
        reason="permission"
        requiredPermission="display.publish"
        onRequestPermission={onRequest}
        actions={[{ label: 'Enable display', onClick: () => {} }]}
      />,
    );
    expect(screen.getByTestId('module-unavailable-reason')).toHaveTextContent(
      'Your role does not include access to this module. Required permission: display.publish.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));
    expect(onRequest).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Enable display' })).toBeInTheDocument();
  });

  it('makes Administration · Modules the enablement owner', () => {
    const onSettings = vi.fn();
    render(
      <ModuleUnavailablePanel
        label="Entries"
        primaryLabel="Meet"
        onGoToPrimary={() => {}}
        onOpenSettings={onSettings}
        reason="not-enabled"
      />,
    );
    expect(screen.getByTestId('module-unavailable-reason')).toHaveTextContent(
      'Enable this module to add it to the tournament workflow.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enable in Administration · Modules' }));
    expect(onSettings).toHaveBeenCalledOnce();
  });
});
