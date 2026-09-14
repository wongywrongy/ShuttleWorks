import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryCodesPanel } from '../RecoveryCodesPanel';

const CODES = ['aaaa1111-bbbb2222-cccc3333-dddd4444', 'eeee5555-ffff6666-0000aaaa-1111bbbb'];

describe('recovery codes panel', () => {
  it('copies every code, one per line, and continues only on acknowledgement', async () => {
    const interact = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    render(<RecoveryCodesPanel codes={CODES} onAcknowledge={onAcknowledge} />);
    await interact.click(screen.getByRole('button', { name: 'Copy codes' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(CODES.join('\n'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(onAcknowledge).not.toHaveBeenCalled();
    await interact.click(screen.getByRole('button', { name: 'I have saved my codes' }));
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledOnce());
  });

  it('keeps the codes on screen when the clipboard is blocked or continuing fails', async () => {
    const interact = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    render(<RecoveryCodesPanel codes={CODES} onAcknowledge={vi.fn().mockRejectedValue(new Error('offline'))} />);
    await interact.click(screen.getByRole('button', { name: 'Copy codes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('copy them by hand');
    await interact.click(screen.getByRole('button', { name: 'I have saved my codes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your codes are still here');
    expect(screen.getByRole('list', { name: 'Recovery codes' })).toHaveTextContent(CODES[0]);
    expect(screen.getByRole('button', { name: 'I have saved my codes' })).toBeEnabled();
  });
});
