/**
 * FormActions — the five Save/Discard states (v3 consolidated plan §08,
 * ruling R2). One assertion set per state, driven straight off the plain
 * boolean props rather than a derived enum, matching the component's own
 * contract.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormActions } from '@scheduler/design-system';

describe('FormActions', () => {
  it('clean: Save is disabled with a visible reason, not a bare gray button', () => {
    render(<FormActions dirty={false} onSave={vi.fn()} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(screen.getByText('No changes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('dirty: Save is enabled and Discard appears', () => {
    render(<FormActions dirty onSave={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(screen.queryByText('No changes')).not.toBeInTheDocument();
  });

  it('saving: Save reads "Saving…" and is disabled; Discard is hidden', () => {
    render(<FormActions dirty saving onSave={vi.fn()} onDiscard={vi.fn()} />);
    const save = screen.getByRole('button', { name: 'Saving…' });
    expect(save).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('error: the message is shown, Save re-enables as the retry action, Discard stays (input preserved)', () => {
    render(
      <FormActions
        dirty
        error="This section could not be saved. Your draft is still here."
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('locked: Save and Discard are hidden entirely, replaced by a one-line reason', () => {
    render(
      <FormActions
        dirty={false}
        locked
        lockedReason="This draw has been generated. Regenerate it to change format or size."
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
    expect(screen.getByText('This draw has been generated. Regenerate it to change format or size.')).toBeInTheDocument();
  });

  it('calls onSave / onDiscard directly (type="button") unless asFormSubmit is set', () => {
    const onSave = vi.fn();
    render(<FormActions dirty onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('type', 'button');
    save.click();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('asFormSubmit: Save is type="submit" with no onClick, so a wrapping <form> drives onSave', () => {
    const onSave = vi.fn();
    render(<FormActions dirty onSave={onSave} asFormSubmit />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('type', 'submit');
    save.click();
    // No form wraps this in isolation, so clicking dispatches no submit
    // event and onSave (only ever wired to the form's onSubmit) is not
    // called directly by this component.
    expect(onSave).not.toHaveBeenCalled();
  });
});
