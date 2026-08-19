import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvailabilityControl } from '../AvailabilityControl';

const DAY = { dayStart: '09:00', dayEnd: '17:00' };

describe('AvailabilityControl', () => {
  it('renders the empty state when value is [] (all day)', () => {
    render(
      <AvailabilityControl value={[]} {...DAY} onChange={() => {}} />,
    );
    expect(
      screen.getByText('Available all day, no blocked windows.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('availability-period-start-0')).toBeNull();
  });

  it('derives blocked rows from the positive value windows', () => {
    // Allowed 10:00–17:00 within a 09:00–17:00 day ⇒ blocked 09:00–10:00.
    render(
      <AvailabilityControl
        value={[{ start: '10:00', end: '17:00' }]}
        {...DAY}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('availability-period-start-0')).toHaveValue('09:00');
    expect(screen.getByTestId('availability-period-end-0')).toHaveValue('10:00');
  });

  it('add: appends 09:00–10:00 blocked and emits the inverted positive windows', () => {
    const onChange = vi.fn();
    render(<AvailabilityControl value={[]} {...DAY} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('availability-add-period'));
    // Blocked [09:00–10:00] over a 09:00–17:00 day ⇒ allowed [10:00–17:00].
    expect(onChange).toHaveBeenCalledWith([{ start: '10:00', end: '17:00' }]);
  });

  it('edit: changing a bound re-inverts and emits positive windows', () => {
    const onChange = vi.fn();
    // Blocked view: 09:00–10:00.
    render(
      <AvailabilityControl
        value={[{ start: '10:00', end: '17:00' }]}
        {...DAY}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('availability-period-end-0'), {
      target: { value: '11:00' },
    });
    // Blocked becomes 09:00–11:00 ⇒ allowed [11:00–17:00].
    expect(onChange).toHaveBeenCalledWith([{ start: '11:00', end: '17:00' }]);
  });

  it('edit: widening a mid-day blocked period keeps both surrounding windows', () => {
    const onChange = vi.fn();
    // Allowed [09:00–12:00, 13:00–17:00] ⇒ one blocked row 12:00–13:00.
    render(
      <AvailabilityControl
        value={[
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ]}
        {...DAY}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('availability-period-start-0')).toHaveValue('12:00');
    fireEvent.change(screen.getByTestId('availability-period-start-0'), {
      target: { value: '11:00' },
    });
    // Blocked becomes 11:00–13:00 ⇒ allowed [09:00–11:00, 13:00–17:00].
    expect(onChange).toHaveBeenCalledWith([
      { start: '09:00', end: '11:00' },
      { start: '13:00', end: '17:00' },
    ]);
  });

  it('remove: deleting the only blocked period emits [] (all day)', () => {
    const onChange = vi.fn();
    render(
      <AvailabilityControl
        value={[{ start: '10:00', end: '17:00' }]}
        {...DAY}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('availability-period-remove-0'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('remove: deleting one of two blocked periods keeps the other inverted', () => {
    const onChange = vi.fn();
    // Allowed [09:00–12:00, 13:00–16:00] ⇒ blocked [12:00–13:00, 16:00–17:00].
    render(
      <AvailabilityControl
        value={[
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '16:00' },
        ]}
        {...DAY}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('availability-period-remove-1'));
    // Only 12:00–13:00 remains blocked ⇒ allowed [09:00–12:00, 13:00–17:00].
    expect(onChange).toHaveBeenCalledWith([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ]);
  });

  it('renders the full-day-blocked guard as one whole-day row', () => {
    render(
      <AvailabilityControl
        value={[{ start: '09:00', end: '09:00' }]}
        {...DAY}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('availability-period-start-0')).toHaveValue('09:00');
    expect(screen.getByTestId('availability-period-end-0')).toHaveValue('17:00');
  });

  it('disabled: all inputs and buttons are disabled', () => {
    render(
      <AvailabilityControl
        value={[{ start: '10:00', end: '17:00' }]}
        {...DAY}
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByTestId('availability-period-start-0')).toBeDisabled();
    expect(screen.getByTestId('availability-period-end-0')).toBeDisabled();
    expect(screen.getByTestId('availability-period-remove-0')).toBeDisabled();
    expect(screen.getByTestId('availability-add-period')).toBeDisabled();
  });
});
